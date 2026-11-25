#!/bin/bash
# 서가명강 서가 개발 서버를 켜고 브라우저를 연다(macOS용. Windows는 시작 5290.bat).
cd "$(dirname "$0")" || exit 1
(sleep 2 && open "http://localhost:5290") &
npm run dev
