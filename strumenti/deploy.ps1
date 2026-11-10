# Pubblica l'ultimo commit sul server e riavvia il sito.
#
#   powershell -File strumenti\deploy.ps1
#
# L'indirizzo del server non sta in git: va scritto in strumenti\server-remoto.txt
# (prima riga: utente@host per ssh; seconda riga, facoltativa: indirizzo pubblico del sito).
# Sul server il deploy porta solo il codice: la cartella data/ (database) e il file .env non vengono toccati.
param(
  [string]$Dir = "pianolezione",
  [int]$Port = 64100,
  [string]$Pm2Name = "pianolezione",
  [string]$Health = "/api/health"
)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

$configFile = Join-Path $PSScriptRoot "server-remoto.txt"
if (-not (Test-Path $configFile)) { throw "Manca strumenti\server-remoto.txt (prima riga: utente@host)" }
$config = @(Get-Content $configFile | Where-Object { $_.Trim() })
$Server = $config[0].Trim()
$PublicUrl = if ($config.Count -gt 1) { $config[1].Trim() } else { "" }

# La build si fa qui sul PC: sul server Turbopack non funziona, perche' il firewall blocca le porte
# locali che usa per parlare con i suoi processi di supporto. Deve corrispondere al commit pubblicato.
if (git -C $root status --porcelain) { throw "Ci sono modifiche non committate: fai il commit prima del deploy" }
Push-Location $root
try {
  npm run build
  if ($LASTEXITCODE -ne 0) { throw "build non riuscita" }
  $nextTar = Join-Path $env:TEMP "$Dir-next.tar"
  tar -cf $nextTar --exclude=.next/cache --exclude=.next/dev .next
  if ($LASTEXITCODE -ne 0) { throw "impacchettamento della build non riuscito" }
} finally { Pop-Location }

# Solo cio' che e' committato. autocrlf=false: gli a capo di Windows romperebbero gli script su Linux.
$tar = Join-Path $env:TEMP "$Dir-deploy.tar"
git -C $root -c core.autocrlf=false archive --format=tar -o $tar HEAD
if ($LASTEXITCODE -ne 0) { throw "git archive non riuscito" }

$remote = @'
set -e
mkdir -p ~/@DIR@/data && cd ~/@DIR@

# Si cancellano SOLO le cartelle del codice, cosi' spariscono i file tolti dal repository.
# Mai data/ (database), .env, node_modules.
rm -rf src prisma public strumenti .next
tar -xf ~/@DIR@-deploy.tar && rm ~/@DIR@-deploy.tar
tar -xf ~/@DIR@-next.tar && rm ~/@DIR@-next.tar

# Impostazioni del server, fuori da git: create solo la prima volta.
if [ ! -f .env ]; then
  printf 'DATABASE_URL="file:%s/data/pianolezione.db"\n' "$PWD" > .env
  chmod 600 .env
fi
# Chiave per cifrare i dati riservati (chiavi AI, link dei calendari): generata una volta sola.
# Se si perde, le chiavi e i calendari salvati dagli utenti vanno reinseriti.
grep -q '^APP_SECRET=' .env || printf 'APP_SECRET="%s"\n' "$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')" >> .env

# Dipendenze: reinstallate solo se package-lock.json e' cambiato.
if ! sha1sum -c --status node_modules/.package-lock.sha1 2>/dev/null; then
  echo "== installo le dipendenze"
  npm ci --no-audit --no-fund --loglevel=error
  sha1sum package-lock.json > node_modules/.package-lock.sha1
fi

# Copia del database prima di applicare lo schema nuovo.
[ -f data/pianolezione.db ] && cp data/pianolezione.db data/pianolezione.prima-del-deploy.db
echo "== aggiorno il database"
npx prisma db push

# La build arriva da Windows: i pacchetti esterni in .next/node_modules (tra cui il modulo nativo di
# SQLite) sono copie di quelli del PC. Si sostituiscono con collegamenti a quelli installati qui.
for p in .next/node_modules/* .next/node_modules/@*/*; do
  [ -e "$p" ] || continue
  case "$p" in */@*) [ "$(dirname "$p")" = .next/node_modules ] && continue ;; esac
  name=$(printf %s "${p#.next/node_modules/}" | sed -E "s/-[0-9a-f]{16}$//")
  [ -d "node_modules/$name" ] || { echo "Pacchetto mancante sul server: $name"; exit 1; }
  rm -rf "$p" && ln -s "$PWD/node_modules/$name" "$p"
done

if pm2 describe @PM2NAME@ >/dev/null 2>&1; then
  pm2 restart @PM2NAME@ --update-env >/dev/null
else
  NODE_ENV=production pm2 start node_modules/next/dist/bin/next --name @PM2NAME@ \
    --max-memory-restart 500M -- start -H 127.0.0.1 -p @PORT@ >/dev/null
fi
pm2 save >/dev/null

# Il controllo si fa dal server: dall'esterno potrebbe rispondere Cloudflare al posto del sito.
for i in $(seq 60); do
  curl -sf "http://127.0.0.1:@PORT@@HEALTH@" >/dev/null && exit 0
  sleep 2
done
echo "Il server non risponde: pm2 logs @PM2NAME@ --lines 100"; exit 1
'@
$body = $remote.Replace("@DIR@", $Dir).Replace("@PM2NAME@", $Pm2Name).Replace("@PORT@", "$Port").Replace("@HEALTH@", $Health)
$script = Join-Path $env:TEMP "$Dir-deploy.sh"
[IO.File]::WriteAllText($script, $body.Replace("`r`n", "`n") + "`n", (New-Object Text.UTF8Encoding $false))

scp -q $tar $nextTar $script "${Server}:"
if ($LASTEXITCODE -ne 0) { throw "copia sul server non riuscita" }
Remove-Item $tar, $nextTar, $script

ssh $Server "sh $Dir-deploy.sh; s=`$?; rm -f $Dir-deploy.sh; exit `$s"
if ($LASTEXITCODE -ne 0) { throw "aggiornamento sul server non riuscito (o il sito non risponde)" }

if ($PublicUrl) { "Aggiornato e acceso: $PublicUrl" } else { "Aggiornato e acceso" }
