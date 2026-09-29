#!/bin/sh
# Kiểm tra trước deploy (mục 6.7 kế hoạch) — chạy trong Termux TRƯỚC `firebase deploy --only hosting`.
#   sh tools/predeploy_check.sh <thư mục deploy>
# Chạy từ THƯ MỤC LÀM VIỆC (có code mới + tools/ + tests/); đối số là thư mục deploy (bỏ trống = chính thư mục này).
# Cần: node (pkg install nodejs) và gói acorn (chạy `npm install` một lần trong thư mục này).
# Dừng ở lỗi đầu tiên; báo "=> ĐƯỢC DEPLOY" chỉ khi mọi bước đạt. Không chạy được = KHÔNG deploy.
DEPLOY="${1:-.}"
[ -d "$DEPLOY" ] || { echo "❌ Không thấy thư mục deploy: $DEPLOY"; echo "=> KHÔNG ĐƯỢC DEPLOY"; exit 1; }
DEPLOY="$(cd "$DEPLOY" && pwd)"
cd "$(dirname "$0")/.." || exit 1
command -v node >/dev/null 2>&1 || { echo "❌ Chưa có node — chạy: pkg install nodejs"; echo "=> KHÔNG ĐƯỢC DEPLOY"; exit 1; }
[ -d node_modules/acorn ] && [ -d node_modules/acorn-walk ] || { echo "❌ Thiếu gói acorn — chạy: npm install"; echo "=> KHÔNG ĐƯỢC DEPLOY"; exit 1; }

echo "== thư mục deploy: $DEPLOY"
node tools/predeploy_check.js "$DEPLOY" || exit 1
echo "== rào ranh giới Unit Engine (code nguồn)"
node tools/check_boundaries.js || { echo "=> KHÔNG ĐƯỢC DEPLOY"; exit 1; }
echo "== test tự động (code nguồn)"
sh tests/run_all.sh >/tmp/gieo_test_$$.log 2>&1 || { tail -30 /tmp/gieo_test_$$.log; rm -f /tmp/gieo_test_$$.log; echo "=> KHÔNG ĐƯỢC DEPLOY"; exit 1; }
tail -1 /tmp/gieo_test_$$.log; rm -f /tmp/gieo_test_$$.log
echo "=> ĐƯỢC DEPLOY"
