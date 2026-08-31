package com.thecafe33.posprinter

import android.Manifest
import android.bluetooth.BluetoothManager
import android.bluetooth.BluetoothSocket
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.webkit.ConsoleMessage
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import net.posprinter.IConnectListener
import net.posprinter.IDeviceConnection
import net.posprinter.POSConnect
import net.posprinter.esc.PosUdpNet
import org.json.JSONArray
import org.json.JSONObject
import java.io.OutputStream
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledFuture
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var bridge: PrinterBridge

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        POSConnect.init(applicationContext)
        requestNeededPermissions()

        webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.webViewClient = WebViewClient()

        // Chuyển console.log/warn/error của trang web ra logcat. Trước đây KHÔNG có
        // WebChromeClient nên mọi console.warn trong posgieo.html rơi vào hư không —
        // không có cách nào xem được app đang báo lỗi gì, kể cả khi cắm máy tính.
        webView.webChromeClient = object : WebChromeClient() {
            override fun onConsoleMessage(cm: ConsoleMessage): Boolean {
                Log.d(TAG_WEB, "${cm.messageLevel()} ${cm.message()} @${cm.lineNumber()}")
                return true
            }
        }
        // Cho phép gỡ lỗi trang web qua chrome://inspect trên máy tính. Đây là app nội bộ
        // của quán, chỉ nạp đúng URL của quán — đổi lại là lần sau có sự cố thì soi được
        // ngay thay vì phải suy đoán.
        WebView.setWebContentsDebuggingEnabled(true)

        bridge = PrinterBridge(this)
        webView.addJavascriptInterface(bridge, "AndroidPrinter")

        webView.loadUrl("https://the-cafe-33.web.app/posgieo.html")
    }

    private fun requestNeededPermissions() {
        val needed = mutableListOf<String>()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.BLUETOOTH_CONNECT)
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.BLUETOOTH_SCAN)
                != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.BLUETOOTH_SCAN)
        }
        if (needed.isNotEmpty()) {
            ActivityCompat.requestPermissions(this, needed.toTypedArray(), 101)
        }
    }

    override fun onDestroy() {
        // Đóng hẳn socket máy in khi app thoát. Máy in tem LAN chỉ nhận MỘT phiên TCP tại
        // một thời điểm — bỏ socket lại là lần mở app sau không kết nối được cho tới khi
        // máy in tự hết giờ chờ.
        try { bridge.shutdown() } catch (e: Exception) { Log.w(TAG, "shutdown", e) }
        super.onDestroy()
    }

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    companion object {
        const val TAG = "PosPrinter"
        const val TAG_WEB = "PosPrinterWeb"
    }
}

/**
 * Cầu nối JS ⇄ Android.
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * NGUYÊN TẮC SỐ 1 — máy in tem LAN (XP-365B) chỉ nhận MỘT phiên TCP tại một thời điểm
 * trên cổng 9100. Mở phiên thứ hai trong khi phiên cũ còn sống thì máy in TỪ CHỐI.
 *
 * Bản trước mắc đúng cái bẫy đó: connectPrinter() tạo IDeviceConnection mới mỗi lần gọi,
 * gán đè lên temConnection mà KHÔNG BAO GIỜ đóng cái cũ. Hệ quả dây chuyền:
 *   · socket cũ bị bỏ rơi nhưng vẫn mở → chiếm luôn phiên duy nhất của máy in;
 *   · kết nối mới bị từ chối, nhưng temConnection đã trỏ vào nó rồi;
 *   · isAvailable() = temConnection.isConnect() = false → app báo "mất kết nối" trong khi
 *     socket cũ vẫn sống nhăn;
 *   · printRawBytes() thấy isConnect() false → return lặng lẽ, tem không in, không báo lỗi;
 *   · watchdog phía web thấy false → 10 giây lại gọi connectPrinter() lần nữa → rò rỉ thêm.
 * Vòng này không tự thoát được: chỉ khởi động lại app hoặc rút điện máy in.
 *
 * Bản này chốt lại bằng ba điều:
 *   1. ĐÓNG cái cũ trước khi mở cái mới, luôn luôn (closeSync).
 *   2. Mọi thao tác kết nối/gửi đi qua MỘT executor đơn luồng → không bao giờ chồng nhau.
 *   3. Đã nối đúng IP đó rồi thì connectPrinter() là lệnh KHÔNG LÀM GÌ CẢ, không đụng
 *      tới socket đang tốt. Phía web có gọi thừa bao nhiêu lần cũng vô hại.
 *
 * NGUYÊN TẮC SỐ 2 — không nuốt lỗi. Mọi lượt gửi đều đếm được (sentOk/failed) và lý do
 * lỗi gần nhất đọc được qua getTemStatus(), để trang web biết THẬT SỰ tem có ra hay không
 * thay vì báo "đã gửi" cho một socket đã chết.
 * ══════════════════════════════════════════════════════════════════════════════
 */
class PrinterBridge(private val context: Context) {

    private val mainHandler = Handler(Looper.getMainLooper())

    // Đơn luồng — mọi thao tác kết nối và gửi của máy in tem xếp hàng qua đây, nên không
    // bao giờ có hai lệnh connect chồng nhau, cũng không có gửi chen giữa lúc đang nối.
    private val temExecutor = Executors.newSingleThreadExecutor()
    private val keepAliveExecutor = Executors.newSingleThreadScheduledExecutor()

    // ══════════════════════════════════════════════════════════════════════════
    // Máy in TEM — LAN/Ethernet qua SDK Xprinter
    // ══════════════════════════════════════════════════════════════════════════
    @Volatile private var temConnection: IDeviceConnection? = null
    @Volatile private var temIp: String? = null
    @Volatile private var temLastError: String = ""
    @Volatile private var temLastErrorAt: Long = 0L
    @Volatile private var temLastSendAt: Long = 0L
    private val temConnecting = AtomicBoolean(false)
    private val temPending = AtomicInteger(0)
    private val temSentOk = AtomicInteger(0)
    private val temFailed = AtomicInteger(0)

    private fun temError(msg: String) {
        temLastError = msg
        temLastErrorAt = System.currentTimeMillis()
        Log.w(MainActivity.TAG, "[tem] $msg")
    }

    /** Đóng một kết nối cho thật hẳn. Nuốt mọi lỗi — đóng là thao tác dọn dẹp, không được ném. */
    private fun closeQuietly(conn: IDeviceConnection?) {
        if (conn == null) return
        try { conn.closeSync() } catch (e: Throwable) {
            try { conn.close() } catch (e2: Throwable) { Log.w(MainActivity.TAG, "close", e2) }
        }
    }

    /**
     * Kết nối máy in tem theo IP.
     *
     * An toàn khi gọi thừa: đang nối đúng IP đó rồi thì hàm này KHÔNG làm gì. Đây là điểm
     * mấu chốt — phía web có nhiều chỗ gọi (trước mỗi lượt in, watchdog, nút kết nối lại,
     * quay lại app...) và trước đây mỗi lần gọi là một lần đánh cược mất kết nối đang tốt.
     */
    @JavascriptInterface
    fun connectPrinter(ip: String) {
        if (ip.isBlank()) { temError("IP rỗng"); return }
        // Đã nối đúng máy này rồi — để yên. Đây là nhánh chạy trong ĐA SỐ trường hợp.
        val cur = temConnection
        if (cur != null && ip == temIp && safeIsConnect(cur)) return
        // Đang có một lượt nối chạy dở — bỏ qua, đừng xếp thêm hàng.
        if (!temConnecting.compareAndSet(false, true)) return

        temExecutor.execute {
            try {
                val prev = temConnection
                if (prev != null) {
                    temConnection = null
                    closeQuietly(prev)
                    // Cho máy in một nhịp để giải phóng phiên TCP trước khi xin phiên mới.
                    // Không có bước này thì lệnh nối ngay sau đó dễ bị chính socket vừa đóng
                    // của mình chặn lại.
                    try { Thread.sleep(300) } catch (e: InterruptedException) { Thread.currentThread().interrupt() }
                }

                val conn = POSConnect.createDevice(POSConnect.DEVICE_TYPE_ETHERNET)
                val listener = IConnectListener { code, _, msg -> onTemStatus(conn, code, msg) }
                val ok = try {
                    conn.connectSync(ip, listener)
                } catch (e: Throwable) {
                    temError("nối lỗi: ${e.message}")
                    false
                }

                if (ok) {
                    temConnection = conn
                    temIp = ip
                    temLastError = ""
                    Log.i(MainActivity.TAG, "[tem] đã nối $ip")
                } else {
                    closeQuietly(conn)
                    temConnection = null
                    temError("không nối được $ip")
                }
            } finally {
                temConnecting.set(false)
            }
        }
    }

    /**
     * Callback trạng thái của SDK. Bản trước truyền lambda RỖNG vào đây, tức vứt bỏ toàn bộ
     * tín hiệu lỗi — trong đó có CONNECT_INTERRUPT, sự kiện máy in tự đóng socket lúc nhàn
     * rỗi. Không xử lý nó chính là lý do kết nối chết mà app không hề hay biết.
     */
    private fun onTemStatus(conn: IDeviceConnection, code: Int, msg: String?) {
        when (code) {
            POSConnect.CONNECT_SUCCESS -> Log.i(MainActivity.TAG, "[tem] CONNECT_SUCCESS")
            POSConnect.CONNECT_FAIL -> {
                temError("CONNECT_FAIL ${msg ?: ""}")
                clearIfCurrent(conn)
            }
            POSConnect.CONNECT_INTERRUPT -> {
                temError("CONNECT_INTERRUPT ${msg ?: ""}")
                clearIfCurrent(conn)
            }
            POSConnect.SEND_FAIL -> temError("SEND_FAIL ${msg ?: ""}")
            else -> Log.d(MainActivity.TAG, "[tem] status=$code ${msg ?: ""}")
        }
    }

    /**
     * Dọn kết nối hỏng — nhưng CHỈ khi nó vẫn là kết nối hiện hành. Nếu trong lúc đó đã có
     * lượt nối mới thành công thì callback muộn của kết nối cũ không được phép xoá cái mới.
     */
    private fun clearIfCurrent(conn: IDeviceConnection) {
        if (temConnection === conn) {
            temConnection = null
            temExecutor.execute { closeQuietly(conn) }
        } else {
            closeQuietly(conn)
        }
    }

    private fun safeIsConnect(conn: IDeviceConnection?): Boolean =
        try { conn?.isConnect() ?: false } catch (e: Throwable) { false }

    @JavascriptInterface
    fun isAvailable(): Boolean = safeIsConnect(temConnection)

    /**
     * Gửi byte thô tới máy in tem.
     *
     * Trả về `true` nếu lệnh đã được NHẬN vào hàng đợi gửi (không phải "đã in xong" — muốn
     * biết kết quả thật thì đọc getTemStatus() sau khi pending về 0). Trả `false` nghĩa là
     * chắc chắn KHÔNG gửi được: không có kết nối nào cả.
     *
     * Bản trước có hai lệnh `return` trần khi chưa kết nối — nuốt lệnh in không một tiếng
     * động, đó là chỗ mọi tem tự động biến mất. Giờ mọi lượt đều đếm được.
     */
    @JavascriptInterface
    fun printRawBytes(base64Data: String): Boolean {
        val conn = temConnection
        if (conn == null || !safeIsConnect(conn)) {
            temFailed.incrementAndGet()
            temError("gửi thất bại — chưa kết nối")
            return false
        }
        val bytes = try {
            Base64.decode(base64Data, Base64.DEFAULT)
        } catch (e: Throwable) {
            temFailed.incrementAndGet()
            temError("base64 hỏng: ${e.message}")
            return false
        }
        temPending.incrementAndGet()
        temExecutor.execute {
            try { sendOnExecutor(bytes) } finally { temPending.decrementAndGet() }
        }
        return true
    }

    /** Chạy TRONG temExecutor. Không gọi từ luồng khác. */
    private fun sendOnExecutor(bytes: ByteArray) {
        val conn = temConnection
        if (conn == null || !safeIsConnect(conn)) {
            temFailed.incrementAndGet()
            temError("gửi thất bại — mất kết nối giữa chừng")
            return
        }
        try {
            // sendSync chặn cho tới khi byte thực sự đi ra socket → đây chính là cơ chế
            // chống tràn buffer: hàng đợi tự giãn theo tốc độ máy in nuốt dữ liệu, thay vì
            // web cứ 500ms bắn một tem bất kể máy in có kịp hay không.
            val r = conn.sendSync(bytes)
            // Hai lớp kiểm tra vì tài liệu SDK không nói rõ sendSync trả gì khi lỗi: mã âm là
            // hỏng chắc chắn, còn socket đứt ngay trong lúc gửi thì bắt bằng isConnect() sau đó.
            if (r < 0) {
                temFailed.incrementAndGet()
                temError("sendSync trả $r")
            } else if (!safeIsConnect(conn)) {
                temFailed.incrementAndGet()
                temError("mất kết nối ngay trong lúc gửi")
            } else {
                temSentOk.incrementAndGet()
                temLastSendAt = System.currentTimeMillis()
            }
        } catch (e: Throwable) {
            temFailed.incrementAndGet()
            temError("gửi lỗi: ${e.message}")
        }
    }

    /** Trạng thái đầy đủ của máy in tem, dạng JSON — nguồn sự thật cho phía web. */
    @JavascriptInterface
    fun getTemStatus(): String = JSONObject().apply {
        put("connected", safeIsConnect(temConnection))
        put("connecting", temConnecting.get())
        put("ip", temIp ?: "")
        put("pending", temPending.get())
        put("sentOk", temSentOk.get())
        put("failed", temFailed.get())
        put("lastError", temLastError)
        put("lastErrorAt", temLastErrorAt)
        put("lastSendAt", temLastSendAt)
        put("discovering", discovering.get())
    }.toString()

    /** Đặt lại bộ đếm — phía web gọi trước mỗi lượt in để đo đúng lượt đó. */
    @JavascriptInterface
    fun resetTemCounters() {
        temSentOk.set(0)
        temFailed.set(0)
        temLastError = ""
        temLastErrorAt = 0L
    }

    /** Ngắt kết nối máy in tem. Trước đây KHÔNG có hàm này — web không có cách nào dọn dẹp. */
    @JavascriptInterface
    fun disconnectPrinter() {
        val prev = temConnection
        temConnection = null
        temIp = null
        temExecutor.execute { closeQuietly(prev) }
    }

    // ---- Keepalive: giữ socket sống để KHÔNG BAO GIỜ phải nối lại ------------------
    // Máy in tem LAN tự đóng socket sau 30–90 giây nhàn rỗi (mặc định firmware, không sửa
    // được từ ngoài). Mỗi lần đóng là một lần phải nối lại, mà nối lại là thao tác rủi ro
    // nhất trong toàn bộ hệ thống này. Rẻ hơn nhiều: cứ vài chục giây gửi một gói vô hại
    // để socket không bao giờ rơi vào trạng thái nhàn rỗi.
    //
    // Đặt ở native chứ không ở web vì timer JavaScript trong WebView bị hệ điều hành bóp
    // lại khi app chạy nền — đúng lúc cần giữ kết nối nhất thì nó lại ngủ.
    //
    // Nội dung gói do phía WEB quyết định (truyền base64 xuống) vì chỉ web mới biết máy
    // đang chạy TSPL hay ESC/POS: với TSPL thì "\r\n" là lệnh rỗng vô hại, còn với ESC/POS
    // thì đúng ký tự đó lại là lệnh xuống dòng — sẽ nhả giấy mỗi chu kỳ.
    @Volatile private var keepAlivePayload: ByteArray? = null
    private var keepAliveTask: ScheduledFuture<*>? = null

    @JavascriptInterface
    fun setTemKeepAlive(base64Payload: String, intervalMs: Int) {
        keepAliveTask?.cancel(false)
        keepAliveTask = null
        if (base64Payload.isEmpty() || intervalMs <= 0) {
            keepAlivePayload = null
            Log.i(MainActivity.TAG, "[tem] keepalive TẮT")
            return
        }
        keepAlivePayload = try {
            Base64.decode(base64Payload, Base64.DEFAULT)
        } catch (e: Throwable) {
            temError("keepalive base64 hỏng: ${e.message}")
            null
        }
        if (keepAlivePayload == null) return
        val period = intervalMs.toLong().coerceAtLeast(5000L)
        keepAliveTask = keepAliveExecutor.scheduleWithFixedDelay({
            try { keepAliveTick(period) } catch (e: Throwable) { Log.w(MainActivity.TAG, "keepalive", e) }
        }, period, period, TimeUnit.MILLISECONDS)
        Log.i(MainActivity.TAG, "[tem] keepalive BẬT mỗi ${period}ms")
    }

    private fun keepAliveTick(period: Long) {
        val payload = keepAlivePayload ?: return
        if (!safeIsConnect(temConnection)) return      // chưa nối thì không có gì để giữ
        if (temPending.get() > 0) return               // đang in — bản thân việc in đã giữ socket rồi
        if (System.currentTimeMillis() - temLastSendAt < period) return // vừa gửi xong, chưa cần
        temPending.incrementAndGet()
        temExecutor.execute {
            try {
                val conn = temConnection ?: return@execute
                if (!safeIsConnect(conn)) return@execute
                // Cố ý KHÔNG đếm vào sentOk/failed: đây là gói nội bộ, không phải tem của
                // nhân viên. Đếm vào sẽ làm sai con số báo cáo cuối mỗi lượt in.
                try { conn.sendSync(payload) } catch (e: Throwable) { temError("keepalive lỗi: ${e.message}") }
            } finally { temPending.decrementAndGet() }
        }
    }

    // ---- Dò máy in tem trong mạng LAN bằng UDP broadcast ---------------------------
    private var udpNet: PosUdpNet? = null
    private val discoveredLan = ConcurrentHashMap<String, String>() // ip -> mac
    private val discovering = AtomicBoolean(false)

    @JavascriptInterface
    fun startLanDiscovery() {
        // Chống quét chồng: hai lượt quét cùng lúc thì lượt sau xoá sạch kết quả lượt trước
        // (discoveredLan.clear) rồi cả hai cùng trả về danh sách rỗng.
        if (!discovering.compareAndSet(false, true)) return
        discoveredLan.clear()
        try { udpNet?.closeNetSocket() } catch (e: Exception) { }
        val net = PosUdpNet()
        udpNet = net
        try {
            net.searchNetDevice { device ->
                val ip = device.ipStr
                if (!ip.isNullOrEmpty()) discoveredLan[ip] = device.macStr ?: ""
            }
        } catch (e: Exception) {
            temError("quét LAN lỗi: ${e.message}")
        }
        // Đóng socket sau ~2 giây để dừng nghe, tránh treo tài nguyên mạng
        mainHandler.postDelayed({
            try { net.closeNetSocket() } catch (e: Exception) { }
            discovering.set(false)
        }, 2000)
    }

    @JavascriptInterface
    fun isDiscovering(): Boolean = discovering.get()

    @JavascriptInterface
    fun getLanDiscoveryResults(): String {
        val arr = JSONArray()
        for ((ip, mac) in discoveredLan) {
            arr.put(JSONObject().apply {
                put("ip", ip)
                put("mac", mac)
            })
        }
        return arr.toString()
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Máy in BILL — Bluetooth SPP thô bằng API chuẩn Android (không qua SDK Xprinter)
    // ══════════════════════════════════════════════════════════════════════════
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private val btExecutor = Executors.newSingleThreadExecutor()
    @Volatile private var billSocket: BluetoothSocket? = null
    @Volatile private var billOutput: OutputStream? = null
    @Volatile private var billConnected = false
    @Volatile private var billLastError: String = ""

    @JavascriptInterface
    fun listBluetoothPrinters(): String {
        val result = JSONArray()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                ContextCompat.checkSelfPermission(context, Manifest.permission.BLUETOOTH_CONNECT)
                != PackageManager.PERMISSION_GRANTED
            ) return result.toString()

            val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as? BluetoothManager
            val bonded = manager?.adapter?.bondedDevices ?: emptySet()
            for (device in bonded) {
                result.put(JSONObject().apply {
                    put("name", device.name ?: "Không rõ tên")
                    put("mac", device.address)
                })
            }
        } catch (e: SecurityException) {
            billLastError = "thiếu quyền Bluetooth"
        }
        return result.toString()
    }

    @JavascriptInterface
    fun connectBillPrinterBluetooth(mac: String) {
        billConnected = false
        btExecutor.execute {
            try { billOutput?.close() } catch (e: Exception) { }
            try { billSocket?.close() } catch (e: Exception) { }
            billOutput = null
            billSocket = null
            var socket: BluetoothSocket? = null
            try {
                val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
                val adapter = manager.adapter
                val device = adapter.getRemoteDevice(mac)
                try { adapter.cancelDiscovery() } catch (e: Exception) { }
                socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
                socket.connect()
                billSocket = socket
                billOutput = socket.outputStream
                billConnected = true
                billLastError = ""
            } catch (e: Exception) {
                // Bản trước để rơi socket hỏng lại đây — mỗi lần nối trượt là một socket
                // Bluetooth treo cho tới khi thoát app.
                try { socket?.close() } catch (e2: Exception) { }
                billConnected = false
                billLastError = e.message ?: "không nối được"
                Log.w(MainActivity.TAG, "[bill] $billLastError")
            }
        }
    }

    @JavascriptInterface
    fun isBillPrinterAvailable(): Boolean = billConnected

    @JavascriptInterface
    fun getBillStatus(): String = JSONObject().apply {
        put("connected", billConnected)
        put("lastError", billLastError)
    }.toString()

    @JavascriptInterface
    fun disconnectBillPrinter() {
        btExecutor.execute {
            try { billOutput?.close() } catch (e: Exception) { }
            try { billSocket?.close() } catch (e: Exception) { }
            billOutput = null
            billSocket = null
            billConnected = false
        }
    }

    @JavascriptInterface
    fun printBillRawBytes(base64Data: String): Boolean {
        val out = billOutput
        if (out == null || !billConnected) {
            billLastError = "chưa kết nối"
            return false
        }
        val bytes = try {
            Base64.decode(base64Data, Base64.DEFAULT)
        } catch (e: Throwable) {
            billLastError = "base64 hỏng"
            return false
        }
        btExecutor.execute {
            try {
                out.write(bytes)
                out.flush()
            } catch (e: Exception) {
                billConnected = false
                billLastError = e.message ?: "ghi lỗi"
                Log.w(MainActivity.TAG, "[bill] ghi lỗi", e)
            }
        }
        return true
    }

    // ══════════════════════════════════════════════════════════════════════════
    // Phiên bản cầu nối — để trang web biết mình đang chạy trên APK nào.
    //
    // Trong lúc triển khai, tablet sẽ có máy đã cài APK mới máy chưa. Trang web dùng số này
    // để chọn đường: có v2 thì dùng kết quả gửi thật + keepalive native; không có (APK cũ,
    // hàm này undefined) thì lui về cách cũ chứ không vỡ.
    //
    // v1 = bản đầu (không có hàm này)
    // v2 = đóng-trước-khi-mở, single-flight, báo lỗi thật, keepalive, disconnectPrinter
    // ══════════════════════════════════════════════════════════════════════════
    @JavascriptInterface
    fun getBridgeVersion(): Int = 2

    fun shutdown() {
        keepAliveTask?.cancel(false)
        keepAliveExecutor.shutdownNow()
        val prev = temConnection
        temConnection = null
        closeQuietly(prev)
        try { billOutput?.close() } catch (e: Exception) { }
        try { billSocket?.close() } catch (e: Exception) { }
        temExecutor.shutdownNow()
        btExecutor.shutdownNow()
    }
}
