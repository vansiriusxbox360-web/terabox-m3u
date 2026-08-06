@echo off
REM =============================================
REM  Renovar token ndus de Terabox
REM  Extrae la cookie del navegador, la guarda
REM  en token.txt y la copia al portapapeles
REM =============================================
setlocal

cd /d "%~dp0"

REM Buscar python del sistema
set PY=
where python >nul 2>nul
if not errorlevel 1 set PY=python
if not defined PY (
    where py >nul 2>nul
    if not errorlevel 1 set PY=py
)
if not defined PY (
    echo [ERROR] No se encontro Python. Instala Python.
    pause
    exit /b 1
)

REM Extraer token (get_token.py escribe token.txt)
%PY% get_token.py
if errorlevel 1 (
    echo.
    echo Abre terabox.com en Firefox con la sesion iniciada y prueba de nuevo.
    pause
    exit /b 1
)

REM Copiar al portapapeles
type token.txt | clip

echo.
echo ============================================
echo  Token ndus extraido con exito!
echo ============================================
echo.
set /p TOKEN=<token.txt
echo  Token: %TOKEN%
echo.
echo  Ya esta:
echo   - Guardado en token.txt
echo   - Copiado al portapapeles
echo   - El addon lo leera automaticamente
echo.
pause
