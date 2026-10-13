@echo off
REM ===========================================================================
REM Bali Trips - run the PRODUCTION build on Windows (Docker Desktop).
REM
REM   deploy\start-production.cmd                  build + migrate + start
REM   deploy\start-production.cmd seed             ...and load the starter content
REM   deploy\start-production.cmd test-accounts    ...and create test accounts per role
REM   deploy\start-production.cmd seed test-accounts
REM   deploy\start-production.cmd photos           (re)import the real photos (automatic when none)
REM   deploy\start-production.cmd stop             stop everything (data is kept)
REM   deploy\start-production.cmd logs             follow app + worker logs
REM   deploy\start-production.cmd remove-test-accounts
REM
REM Needs: Docker Desktop (WSL2 backend) running. PowerShell is used only to
REM generate secrets and edit .env.production.
REM ===========================================================================
REM Delayed expansion stays OFF until .env.production has been read: with it on,
REM every "!" in a value (a password, say) is silently eaten.
setlocal EnableExtensions DisableDelayedExpansion

cd /d "%~dp0.."
set "ROOT=%CD%"
set "ENV_FILE=%ROOT%\.env.production"
set "COMPOSE=docker compose -f "%ROOT%\docker-compose.production.yml" --env-file "%ENV_FILE%""

set SEED=0
set PHOTOS=0
set TEST_ACCOUNTS=0
set ACTION=up
:parse
if "%~1"=="" goto parsed
if /I "%~1"=="seed" set SEED=1
if /I "%~1"=="photos" set PHOTOS=1
if /I "%~1"=="test-accounts" set TEST_ACCOUNTS=1
if /I "%~1"=="stop" set ACTION=stop
if /I "%~1"=="logs" set ACTION=logs
if /I "%~1"=="remove-test-accounts" set ACTION=remove-tests
shift
goto parse
:parsed

where docker >nul 2>nul || (echo [X] Docker is not installed or not on PATH. & exit /b 1)
docker info >nul 2>nul || (echo [X] Docker Desktop is not running. Start it and try again. & exit /b 1)
docker compose version >nul 2>nul || (echo [X] docker compose is missing. & exit /b 1)
where curl >nul 2>nul || (echo [X] curl.exe is missing ^(it ships with Windows 10 1803+^). & exit /b 1)

REM --- .env.production -------------------------------------------------------
if not exist "%ENV_FILE%" (
  echo.
  echo ^> First run: creating .env.production with new secrets
  copy /Y "%ROOT%\.env.production.example" "%ENV_FILE%" >nul || exit /b 1
  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$f='%ENV_FILE%';" ^
    "function R([int]$n){$b=New-Object byte[] $n;[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b);$b};" ^
    "function Hex([int]$n){(R $n|ForEach-Object{$_.ToString('x2')}) -join ''};" ^
    "function B64([int]$n){[Convert]::ToBase64String((R $n))};" ^
    "$set=[ordered]@{POSTGRES_PASSWORD=(Hex 24);BETTER_AUTH_SECRET=(B64 48);NEXT_SERVER_ACTIONS_ENCRYPTION_KEY=(B64 32);PAYMENT_WEBHOOK_SECRET=(Hex 32);ADMIN_BASE_PATH=('/studio-'+(Hex 4));SITE_DOMAIN='localhost';NEXT_PUBLIC_SITE_URL='http://localhost:3000';BETTER_AUTH_URL='http://localhost:3000';LIVE_MODE='false';PAYMENT_PROVIDER='sandbox';ALLOW_SANDBOX_PAYMENTS='true';ALLOW_BOOKINGS='true';EMAIL_TRANSPORT='console'};" ^
    "$lines=[Collections.Generic.List[string]](Get-Content -LiteralPath $f -Encoding UTF8);" ^
    "foreach($k in $set.Keys){$i=-1;for($j=0;$j -lt $lines.Count;$j++){if($lines[$j] -match ('^'+$k+'=')){$i=$j}};if($i -ge 0){$lines[$i]=$k+'='+$set[$k]}else{$lines.Add($k+'='+$set[$k])}};" ^
    "[IO.File]::WriteAllLines($f,$lines,(New-Object Text.UTF8Encoding $false))" || exit /b 1
  echo   -^> .env.production created. Review it ^(domain, Stripe, Resend, Spaces, WhatsApp^) before going live.
)

REM Read ONLY the values this script needs (literal read, never "sourced"), with
REM delayed expansion off so "!" survives. One pair of surrounding quotes is
REM stripped, as docker compose does: "x" via %%~B, 'x' in :unquote.
set "NEEDED=POSTGRES_USER POSTGRES_DB POSTGRES_PASSWORD DB_HOST_PORT APP_PORT ADMIN_BASE_PATH NEXT_PUBLIC_SITE_URL"
for %%K in (%NEEDED%) do set "%%K="
for /f "usebackq eol=# tokens=1,* delims==" %%A in ("%ENV_FILE%") do (
  for %%K in (%NEEDED%) do if "%%A"=="%%K" set "%%K=%%~B"
)
for %%K in (%NEEDED%) do call :unquote %%K
if not defined POSTGRES_USER set POSTGRES_USER=bali
if not defined POSTGRES_DB set POSTGRES_DB=bali
if not defined DB_HOST_PORT set DB_HOST_PORT=55432
if not defined APP_PORT set APP_PORT=3000
if not defined POSTGRES_PASSWORD (echo [X] POSTGRES_PASSWORD is empty in .env.production & exit /b 1)
if not defined ADMIN_BASE_PATH (echo [X] ADMIN_BASE_PATH is empty in .env.production & exit /b 1)

REM From here on delayed expansion is ON. The values read above are used as
REM !NAME! (inserted verbatim), never %NAME% (whose "!" would be eaten).
setlocal EnableDelayedExpansion

if /I "%ACTION%"=="stop" (
  %COMPOSE% --profile https down
  exit /b !ERRORLEVEL!
)
if /I "%ACTION%"=="logs" (
  %COMPOSE% logs -f --tail=200 app worker
  exit /b !ERRORLEVEL!
)

echo.
echo ^> Starting Postgres and Gotenberg
%COMPOSE% up -d --wait postgres gotenberg || exit /b 1

echo.
echo ^> Building the worker image (migrations, seed, queues)
%COMPOSE% build worker || exit /b 1

if /I "%ACTION%"=="remove-tests" (
  %COMPOSE% run --rm --no-deps worker node_modules/.bin/tsx scripts/create-test-accounts.ts --remove
  exit /b !ERRORLEVEL!
)

echo.
echo ^> Applying database migrations
%COMPOSE% run --rm --no-deps worker node_modules/.bin/tsx src/db/migrate.ts || exit /b 1

set REGIONS=0
for /f "usebackq delims=" %%R in (`%COMPOSE% exec -T postgres psql -U !POSTGRES_USER! -d !POSTGRES_DB! -tAc "select count(*) from regions"`) do set "REGIONS=%%R"
set "REGIONS=%REGIONS: =%"
if "%SEED%"=="1" goto doseed
if "%REGIONS%"=="0" goto doseed
goto noseed
:doseed
echo.
echo ^> Loading starter content (regions, categories, tags, sample places)
%COMPOSE% run --rm --no-deps worker node_modules/.bin/tsx src/db/seed/index.ts || exit /b 1
:noseed

REM Real photos (Wikimedia Commons, with credits). Automatic when the library
REM has none yet; a failure never stops the run - the placeholders stay.
set PHOTO_COUNT=0
for /f "usebackq delims=" %%P in (`%COMPOSE% exec -T postgres psql -U !POSTGRES_USER! -d !POSTGRES_DB! -tAc "select count(*) from media where deleted_at is null and mime_type <> 'image/svg+xml'"`) do set "PHOTO_COUNT=%%P"
set "PHOTO_COUNT=%PHOTO_COUNT: =%"
if "%PHOTOS%"=="1" goto dophotos
if "%PHOTO_COUNT%"=="0" goto dophotos
goto nophotos
:dophotos
echo.
echo ^> Importing the site's photos (a few minutes)
%COMPOSE% run --rm --no-deps worker node_modules/.bin/tsx scripts/import-photos.ts || echo   ! Photo import failed - placeholders stay. Retry: deploy\start-production.cmd photos
:nophotos

echo.
echo ^> Building the app image (this takes a few minutes)
REM next build reads the database. Docker Desktop lets the build container reach
REM the Postgres port published on this PC through host.docker.internal.
set "BUILD_DATABASE_URL=postgresql://!POSTGRES_USER!:!POSTGRES_PASSWORD!@host.docker.internal:!DB_HOST_PORT!/!POSTGRES_DB!"
REM Build args: read and run with delayed expansion OFF ("!" in values survives),
REM one pair of surrounding quotes stripped like the values above.
setlocal DisableDelayedExpansion
set "BUILD_ARGS="
for /f "usebackq tokens=1,* delims==" %%A in (`findstr /R "^NEXT_PUBLIC_ ^ADMIN_BASE_PATH= ^PAYMENT_PROVIDER= ^ALLOW_SANDBOX_PAYMENTS=" "%ENV_FILE%"`) do (
  set "V=%%~B"
  call :unquote V
  call :append %%A
)
docker build --add-host=host.docker.internal:host-gateway --target runner -t bali-app:production --build-arg "DATABASE_URL=%BUILD_DATABASE_URL%" %BUILD_ARGS% "%ROOT%" || exit /b 1
endlocal

echo.
echo ^> Starting app and worker
%COMPOSE% up -d --no-build app worker || exit /b 1

echo.
echo ^> Waiting for the app to answer
set OK=0
for /L %%i in (1,1,60) do (
  if "!OK!"=="0" (
    curl -fsS "http://127.0.0.1:%APP_PORT%/api/health" >nul 2>nul && set OK=1
    if "!OK!"=="0" ping -n 3 127.0.0.1 >nul
  )
)
if not "%OK%"=="1" (
  echo [X] The app did not become healthy. Run: deploy\start-production.cmd logs
  exit /b 1
)

if "%TEST_ACCOUNTS%"=="1" (
  echo.
  echo ^> Creating test accounts for every role
  for /f %%T in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmm"') do set "STAMP=%%T"
  set "OUT=%ROOT%\test-accounts-!STAMP!.txt"
  %COMPOSE% run --rm --no-deps worker node_modules/.bin/tsx scripts/create-test-accounts.ts > "!OUT!"
  if errorlevel 1 (
    type "!OUT!"
    echo [X] Creating the test accounts failed - see the output above.
    exit /b 1
  )
  REM Only the current Windows user may read the file (passwords + 2FA secrets).
  icacls "!OUT!" /inheritance:r /grant:r "%USERNAME%:F" >nul 2>nul
  type "!OUT!"
  echo   -^> saved to !OUT! ^(contains passwords and 2FA secrets - keep it private^)
)

if not defined NEXT_PUBLIC_SITE_URL set "NEXT_PUBLIC_SITE_URL=http://localhost:%APP_PORT%"
echo.
echo ^> Running
echo   Site:   !NEXT_PUBLIC_SITE_URL!
echo   Admin:  !NEXT_PUBLIC_SITE_URL!!ADMIN_BASE_PATH!
echo   Logs:   deploy\start-production.cmd logs
echo   Stop:   deploy\start-production.cmd stop
endlocal
endlocal
exit /b 0

REM ---------------------------------------------------------------------------
REM :unquote NAME - strip one pair of surrounding single quotes from %NAME%,
REM keeping "!" and "%%" in the value intact (the "endlocal tunnel": the value
REM leaves the delayed-expansion scope through a FOR variable).
:unquote
setlocal EnableDelayedExpansion
set "U=!%~1!"
if defined U if "!U:~0,1!!U:~-1!"=="''" set "U=!U:~1,-1!"
if not defined U (
  endlocal
  set "%~1="
  goto :eof
)
for /f "delims=" %%L in (""!U!"") do (
  endlocal
  set "%~1=%%~L"
)
goto :eof

REM :append KEY - add  --build-arg "KEY=<V>"  to BUILD_ARGS, "!" intact.
:append
setlocal EnableDelayedExpansion
set "NEXT=!BUILD_ARGS! --build-arg "%~1=!V!""
for /f "delims=" %%L in ("!NEXT!") do (
  endlocal
  set "BUILD_ARGS=%%L"
)
goto :eof
