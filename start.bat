@echo off
title TradingView Market Simulator (T-Investments)
echo ========================================================
echo   Запуск TradingView Market Simulator...
echo   Источник данных: T-Bank Invest API v2
echo ========================================================
echo.

cd /d "%~dp0"

echo Открываем симулятор в браузере...
start http://localhost:3000

echo Запускаем локальный сервер Node.js...
node server.js

pause
