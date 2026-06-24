@echo off
REM ============================================================
REM  Sobe um servidor local e abre o app no navegador.
REM  Por que? O app usa ES modules (import), que NAO funcionam
REM  abrindo o index.html direto (file://). Precisa de http://.
REM
REM  Como usar: de um duplo-clique neste arquivo.
REM  Para parar o servidor: feche esta janela.
REM ============================================================
title Controle de Planejamento EQTL - servidor local
cd /d "%~dp0"
set PORT=5500
echo.
echo  Servindo a pasta atual em:  http://localhost:%PORT%
echo  Abrindo o navegador...
echo  (Feche esta janela para parar o servidor.)
echo.
start "" "http://localhost:%PORT%/index.html"
python -m http.server %PORT%
