#!/bin/sh
# Chạy từ bất kỳ đâu: sh tests/run_all.sh   (chỉ cần node; không cài gói nào)
cd "$(dirname "$0")" || exit 1
fail=0
for t in *.test.js; do
  out=$(node "$t" 2>&1); code=$?
  echo "== $t"; echo "$out" | grep -E "^(ok|FAIL|ALL PASS|SOME FAIL)|: " | grep -v "listener lỗi" | tail -40
  if [ $code -ne 0 ] || echo "$out" | grep -q -E "^FAIL|SOME FAIL"; then fail=1; fi
done
[ $fail -eq 0 ] && echo "=> TẤT CẢ ĐẠT" || { echo "=> CÓ TEST HỎNG"; exit 1; }
