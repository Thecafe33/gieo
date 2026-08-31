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
import android.webkit.JavascriptInterface
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

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        POSConnect.init(applicationContext)
        requestNeededPermissions()

        webView = WebView(this)
        setContentView(webView)

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.webViewClient = WebViewClient()

        webView.addJavascriptInterface(PrinterBridge(this), "AndroidPrinter")

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

    override fun onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }
}

class PrinterBridge(private val context: Context) {

    private val mainHandler = Handler(Looper.getMainLooper())

    // ---- Máy in TEM — kết nối LAN/Ethernet, dùng SDK Xprinter chính hãng (XP-365B) ----
    private var temConnection: IDeviceConnection? = null

    @JavascriptInterface
    fun connectPrinter(ip: String) {
        val conn = POSConnect.createDevice(POSConnect.DEVICE_TYPE_ETHERNET)
        conn.connect(ip, IConnectListener { _, _, _ -> })
        temConnection = conn
    }

    @JavascriptInterface
    fun isAvailable(): Boolean = temConnection?.isConnect() ?: false

    @JavascriptInterface
    fun printRawBytes(base64Data: String) {
        val conn = temConnection ?: return
        if (!conn.isConnect()) return
        conn.sendData(Base64.decode(base64Data, Base64.DEFAULT))
    }

    // ---- Dò máy in tem trong mạng LAN bằng UDP broadcast (tính năng có sẵn trong SDK Xprinter)
    // — không cần biết/nhập IP, máy in tự phản hồi kèm IP + MAC hiện tại của nó.
    private var udpNet: PosUdpNet? = null
    private val discoveredLan = ConcurrentHashMap<String, String>() // ip -> mac

    @JavascriptInterface
    fun startLanDiscovery() {
        discoveredLan.clear()
        try { udpNet?.closeNetSocket() } catch (e: Exception) {}
        val net = PosUdpNet()
        udpNet = net
        try {
            net.searchNetDevice { device ->
                val ip = device.ipStr
                if (!ip.isNullOrEmpty()) discoveredLan[ip] = device.macStr ?: ""
            }
        } catch (e: Exception) {}
        // Đóng socket sau ~2 giây để dừng nghe, tránh treo tài nguyên mạng
        mainHandler.postDelayed({
            try { net.closeNetSocket() } catch (e: Exception) {}
        }, 2000)
    }

    @JavascriptInterface
    fun getLanDiscoveryResults(): String {
        val arr = JSONArray()
        for ((ip, mac) in discoveredLan) {
            val obj = JSONObject()
            obj.put("ip", ip)
            obj.put("mac", mac)
            arr.put(obj)
        }
        return arr.toString()
    }

    // ---- Máy in BILL — kết nối Bluetooth SPP thô bằng API chuẩn Android (KHÔNG qua SDK
    // Xprinter) vì máy WNN58E là hàng phổ thông, không chắc bắt tay đúng chuẩn Xprinter riêng.
    private val SPP_UUID: UUID = UUID.fromString("00001101-0000-1000-8000-00805F9B34FB")
    private val btExecutor = Executors.newSingleThreadExecutor()
    private var billSocket: BluetoothSocket? = null
    private var billOutput: OutputStream? = null
    @Volatile private var billConnected = false

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
                val obj = JSONObject()
                obj.put("name", device.name ?: "Không rõ tên")
                obj.put("mac", device.address)
                result.put(obj)
            }
        } catch (e: SecurityException) { }
        return result.toString()
    }

    @JavascriptInterface
    fun connectBillPrinterBluetooth(mac: String) {
        billConnected = false
        btExecutor.execute {
            try { billOutput?.close() } catch (e: Exception) {}
            try { billSocket?.close() } catch (e: Exception) {}
            try {
                val manager = context.getSystemService(Context.BLUETOOTH_SERVICE) as BluetoothManager
                val adapter = manager.adapter
                val device = adapter.getRemoteDevice(mac)
                try { adapter.cancelDiscovery() } catch (e: Exception) {}
                val socket = device.createRfcommSocketToServiceRecord(SPP_UUID)
                socket.connect()
                billSocket = socket
                billOutput = socket.outputStream
                billConnected = true
            } catch (e: Exception) {
                billConnected = false
            }
        }
    }

    @JavascriptInterface
    fun isBillPrinterAvailable(): Boolean = billConnected

    @JavascriptInterface
    fun disconnectBillPrinter() {
        btExecutor.execute {
            try { billOutput?.close() } catch (e: Exception) {}
            try { billSocket?.close() } catch (e: Exception) {}
            billOutput = null
            billSocket = null
            billConnected = false
        }
    }

    @JavascriptInterface
    fun printBillRawBytes(base64Data: String) {
        val out = billOutput ?: return
        val bytes = Base64.decode(base64Data, Base64.DEFAULT)
        btExecutor.execute {
            try {
                out.write(bytes)
                out.flush()
            } catch (e: Exception) {
                billConnected = false
            }
        }
    }
}
