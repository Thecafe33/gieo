#!/bin/sh
# SINH LẠI MỌI FILE TỰ ĐỘNG sau khi sửa bất kỳ file gốc nào (pos.html, PosX.html, posgieo.html, quanlygieo.html,
# manage.html, index.html, kiosk.html, *.js…). Chạy từ gốc repo:  sh tools/sinh_lai_tat_ca.sh
# Thứ tự quan trọng: bản Giáng sinh / Tết / thử sinh từ file gốc → bộ deploy theo mùa gom từ tất cả.
cd "$(dirname "$0")/.." || exit 1
set -e
node tools/tao_ban_giangsinh.js      # index.html        → index_giangsinh.html
node tools/tao_ban_tet.js            # pos / PosX / index → pos_tet / PosX_tet / index_tet
node tools/tao_ban_thu.js .          # posgieo / quanlygieo → *_thu.html
node tools/automation/build_page.js  # quanlygieo2 dùng nghiệp vụ và JS chung
node tools/automation/sync.js        # chính sách dùng chung browser / worker
node tools/tao_bo_deploy.js          # → ban_deploy/{thuong,giangsinh,tet}/
test_log=$(mktemp)
trap 'rm -f "$test_log"' EXIT HUP INT TERM
if sh tests/run_all.sh >"$test_log" 2>&1; then
  tail -1 "$test_log"
else
  cat "$test_log"
  exit 1
fi
