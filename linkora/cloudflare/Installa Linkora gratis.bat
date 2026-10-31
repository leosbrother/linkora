@echo off
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js non trovato. Installa Node.js 18 o superiore e riprova.
  echo https://nodejs.org/
  pause
  exit /b 1
)

echo Serve un account Cloudflare gratuito. Questa versione usa l'indirizzo gratuito workers.dev.
echo Non aggiungere domini, non attivare piani a pagamento e non inserire dati di pagamento.
pause

call npx --yes wrangler@latest login
if errorlevel 1 goto failed

findstr /C:"database_id" wrangler.jsonc >nul
if errorlevel 1 (
  call npx --yes wrangler@latest d1 create linkora --jurisdiction eu --binding DB --update-config
  if errorlevel 1 goto failed
)

call npx --yes wrangler@latest d1 execute linkora --remote --file=schema.sql
if errorlevel 1 goto failed

echo Crea ora una password per la dashboard Linkora.
call npx --yes wrangler@latest secret put ADMIN_PASSWORD
if errorlevel 1 goto failed

call npx --yes wrangler@latest deploy
if errorlevel 1 goto failed

echo.
echo Pubblicazione completata. Copia l'indirizzo workers.dev mostrato sopra da Wrangler.
echo La dashboard richiede nome utente linkora e la password appena impostata.
pause
exit /b 0

:failed
echo.
echo Configurazione interrotta. Leggi le istruzioni in README.md e riprova.
pause
exit /b 1
