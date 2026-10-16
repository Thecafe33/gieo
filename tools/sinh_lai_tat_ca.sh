#!/bin/sh
# SINH LẠI MỌI FILE TỰ ĐỘNG sau khi sửa bất kỳ file gốc nào (pos.html, PosX.html, posgieo.html, quanlygieo.html,
# manage.html, index.html, kiosk.html, *.js…). Chạy từ gốc repo:  sh tools/sinh_lai_tat_ca.sh
# Thứ tự quan trọng: bản Giáng sinh / Tết / thử sinh từ file gốc → bộ deploy theo mùa gom từ tất cả.
cd "$(dirname "$0")/.." || exit 1
set -e
node tools/tao_ban_giangsinh.js      # index.html        → index_giangsinh.html
node tools/tao_ban_tet.js            # pos / PosX / index → pos_tet / PosX_tet / index_tet
node tools/tao_ban_thu.js .          # posgieo / quanlygieo → *_thu.html
node tools/tao_bo_deploy.js          # → ban_deploy/{thuong,giangsinh,tet}/
sh tests/run_all.sh | tail -1
