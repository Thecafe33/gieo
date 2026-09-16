/**
 * Composition root: khởi tạo Firebase và trao handle cho runtime.
 *
 * Module này KHÔNG chứa config hay tài khoản. Nó nhận vào.
 *
 * Vì sao: hệ cũ đã có sẵn config và tài khoản trong `posgieo.html`. Chép thêm
 * một bản vào đây là tạo ra bản thứ hai của cùng một bí mật — đổi mật khẩu sau
 * này sẽ sót một chỗ, và chỗ sót đó là chỗ không ai nhớ. Build script trích
 * thẳng từ file cũ, nên bí mật vẫn chỉ nằm đúng một nơi.
 *
 * Đây cũng là tầng DUY NHẤT được phép biết Firebase tồn tại. Domain core nhận
 * handle đã khởi tạo nên không bao giờ chạm SDK (blueprint §2 quy tắc 2), và
 * test chạy được mà không cần mạng.
 *
 * GIỚI HẠN CẦN NÓI RÕ: config và tài khoản là dữ liệu CLIENT — ai mở file HTML
 * cũng đọc được. Hệ cũ đã như vậy suốt thời gian qua. Hệ mới không làm nó tệ
 * hơn, nhưng cũng không làm nó tốt hơn: cái chặn thật là Firebase Security
 * Rules phía server, không phải chỗ cất chuỗi này.
 */
GIEO.define('bootstrap/firebase-app', [
  'shared-kernel/result'
], function (R) {
  'use strict';

  function missing(config) {
    return ['apiKey', 'authDomain', 'databaseURL', 'projectId']
      .filter(function (k) { return !config || !config[k]; });
  }

  /**
   * @param spec.config   firebaseConfig (bắt buộc — không có mặc định)
   * @param spec.account  {email, password} (bắt buộc)
   * @param spec.sdk      đối tượng `firebase` toàn cục; tiêm vào để test không cần mạng
   */
  function init(spec) {
    spec = spec || {};
    var gone = missing(spec.config);
    if (gone.length) {
      return Promise.resolve(R.err('VALIDATION',
        'thiếu firebaseConfig: ' + gone.join(', ') + ' — composition root không có giá trị mặc định'));
    }
    if (!spec.account || !spec.account.email || !spec.account.password) {
      return Promise.resolve(R.err('VALIDATION', 'thiếu tài khoản đăng nhập Firebase'));
    }

    var sdk = spec.sdk || (typeof globalThis !== 'undefined' ? globalThis.firebase : null);
    if (!sdk || typeof sdk.initializeApp !== 'function') {
      return Promise.resolve(R.err('NOT_FOUND',
        'Firebase SDK chưa nạp — kiểm tra kết nối mạng hoặc thẻ <script> của SDK'));
    }

    try {
      if (!sdk.apps || !sdk.apps.length) sdk.initializeApp(spec.config);
    } catch (e) {
      return Promise.resolve(R.err('MANUAL_REVIEW',
        'khởi tạo Firebase thất bại: ' + (e && e.message ? e.message : e)));
    }

    var auth = typeof sdk.auth === 'function' ? sdk.auth() : null;
    if (!auth || typeof auth.signInWithEmailAndPassword !== 'function') {
      return Promise.resolve(R.err('NOT_FOUND', 'Firebase Auth chưa nạp — không đăng nhập được'));
    }

    return Promise.resolve()
      .then(function () {
        return auth.signInWithEmailAndPassword(spec.account.email, spec.account.password);
      })
      .then(function () {
        return R.ok({
          rtdb: sdk.database(),
          firestore: sdk.firestore(),
          projectId: spec.config.projectId
        });
      })
      .catch(function (e) {
        /* Đăng nhập hỏng thì KHÔNG trả handle "chạy tạm". Handle không có quyền
           làm mọi truy vấn trả rỗng, và rỗng trông y hệt "không có dữ liệu" —
           đúng kiểu hỏng im lặng mà cả hệ thống này được dựng ra để chặn. */
        return R.err('RETRYABLE',
          'đăng nhập Firebase thất bại, KHÔNG chạy với quyền rỗng: ' +
          (e && e.message ? e.message : e));
      });
  }

  return { init: init };
});
