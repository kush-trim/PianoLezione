#!/usr/bin/env bash
# Deploy automatico, lato server.
#
# Gira sotto pm2 (processo "pianolezione-deploy"). Ogni minuto guarda se GitHub ha pubblicato
# un pacchetto nuovo (lo costruisce .github/workflows/deploy.yml a ogni push su main) e lo installa.
# Se dopo l'installazione il sito non risponde, rimette il codice di prima.
#
# Installazione, una volta sola (la copia in uso sta fuori dalla cartella dell'app, che a ogni
# deploy viene sostituita; poi si aggiorna da sola dal repository):
#   mkdir -p ~/pianolezione-deploy && cp strumenti/server/auto-deploy.sh ~/pianolezione-deploy/
#   pm2 start ~/pianolezione-deploy/auto-deploy.sh --name pianolezione-deploy --interpreter bash
#   pm2 save
#
# Registro: ~/pianolezione-deploy/deploy.log
set -u

APP="$HOME/pianolezione"
STATE="$HOME/pianolezione-deploy"
BASE="https://github.com/kush-trim/PianoLezione/releases/download/deploy"
PORT=64100
PM2=pianolezione
HEALTH="/api/health"
EVERY=60

SELF="$STATE/auto-deploy.sh"
LOG="$STATE/deploy.log"
mkdir -p "$STATE" "$APP/data"

log() {
  echo "$(date '+%F %T') $*" | tee -a "$LOG"
  # Il registro non cresce all'infinito.
  if [ "$(wc -l < "$LOG")" -gt 2000 ]; then tail -1000 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; fi
}

healthy() {
  for _ in $(seq 45); do
    curl -sf --max-time 5 "http://127.0.0.1:$PORT$HEALTH" > /dev/null && return 0
    sleep 2
  done
  return 1
}

restart_app() {
  if pm2 describe "$PM2" > /dev/null 2>&1; then
    pm2 restart "$PM2" --update-env > /dev/null
  else
    (cd "$APP" && NODE_ENV=production pm2 start node_modules/next/dist/bin/next --name "$PM2" \
      --max-memory-restart 500M -- start -H 127.0.0.1 -p "$PORT" > /dev/null)
  fi
  pm2 save > /dev/null
}

# Dipendenze: reinstallate solo se package-lock.json è cambiato.
install_deps() {
  if ! sha1sum -c --status node_modules/.package-lock.sha1 2> /dev/null; then
    log "installo le dipendenze"
    npm ci --no-audit --no-fund --loglevel=error >> "$LOG" 2>&1 || return 1
    sha1sum package-lock.json > node_modules/.package-lock.sha1
  fi
}

# La build arriva da un'altra macchina: i pacchetti esterni in .next/node_modules (tra cui il modulo
# nativo di SQLite) puntano a percorsi che qui non esistono. Si ripuntano a quelli installati qui.
relink_externals() {
  local p name
  for p in .next/node_modules/* .next/node_modules/@*/*; do
    [ -e "$p" ] || [ -L "$p" ] || continue
    case "$p" in */@*) [ "$(dirname "$p")" = .next/node_modules ] && continue ;; esac
    name=$(printf %s "${p#.next/node_modules/}" | sed -E 's/-[0-9a-f]{16}$//')
    [ -d "node_modules/$name" ] || { log "pacchetto mancante sul server: $name"; return 1; }
    rm -rf "$p" && ln -s "$PWD/node_modules/$name" "$p"
  done
}

# Le cartelle del codice: sono le sole che il deploy sostituisce. Mai data/, .env, node_modules.
CODE_DIRS="src prisma public strumenti .next .github"

rollback() {
  log "ripristino il codice precedente"
  cd "$APP" || return 1
  local d
  for d in $CODE_DIRS; do rm -rf "$d"; done
  cp -a "$STATE/prev/." "$APP/" 2> /dev/null
  install_deps
  restart_app
  if healthy; then log "codice precedente ripristinato: il sito risponde"; else log "ATTENZIONE: il sito non risponde nemmeno con il codice precedente"; fi
}

deploy() {
  local sha="$1" sum="$2" tmp d f
  tmp=$(mktemp -d "$STATE/tmp.XXXXXX") || return 1
  # shellcheck disable=SC2064
  trap "rm -rf '$tmp'" RETURN

  curl -fsSL --retry 3 --max-time 300 -o "$tmp/build.tar.gz" "$BASE/build.tar.gz" || { log "scaricamento non riuscito"; return 1; }
  echo "$sum  $tmp/build.tar.gz" | sha256sum -c --status || { log "il pacchetto non corrisponde alla sua impronta: lo ignoro"; return 1; }
  mkdir "$tmp/new" && tar -xzf "$tmp/build.tar.gz" -C "$tmp/new" || { log "pacchetto illeggibile"; return 1; }
  [ -f "$tmp/new/package.json" ] && [ -d "$tmp/new/.next" ] || { log "pacchetto incompleto"; return 1; }

  cd "$APP" || return 1

  # Copia di ciò che sta per essere sostituito, per poter tornare indietro.
  rm -rf "$STATE/prev" && mkdir "$STATE/prev"
  for d in $CODE_DIRS; do [ -e "$d" ] && mv "$d" "$STATE/prev/"; done
  for f in * .gitignore .env.example; do [ -f "$f" ] && cp -a "$f" "$STATE/prev/"; done

  cp -a "$tmp/new/." "$APP/"

  # Impostazioni del server, fuori da git: create solo la prima volta.
  if [ ! -f .env ]; then
    printf 'DATABASE_URL="file:%s/data/pianolezione.db"\n' "$PWD" > .env
    chmod 600 .env
  fi
  # Chiave per cifrare i dati riservati: generata una volta sola, mai sostituita.
  grep -q '^APP_SECRET=' .env || printf 'APP_SECRET="%s"\n' "$(node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))')" >> .env

  install_deps || { log "installazione delle dipendenze non riuscita"; rollback; return 1; }

  # Copia del database prima di applicare lo schema nuovo. Le modifiche che cancellerebbero
  # dati vengono rifiutate da prisma: in quel caso il deploy si ferma qui.
  [ -f data/pianolezione.db ] && cp data/pianolezione.db data/pianolezione.prima-del-deploy.db
  npx prisma db push >> "$LOG" 2>&1 || { log "aggiornamento del database non riuscito"; rollback; return 1; }

  relink_externals || { rollback; return 1; }

  echo "$sha" > VERSION
  restart_app
  if healthy; then return 0; fi
  log "dopo l'aggiornamento il sito non risponde"
  rollback
  return 1
}

log "avviato (controllo ogni ${EVERY}s)"
while true; do
  # Lo script si aggiorna dal repository: se il deploy ne ha portato una versione nuova, riparte con quella.
  NEW="$APP/strumenti/server/auto-deploy.sh"
  if [ -f "$NEW" ] && [ -f "$SELF" ] && ! cmp -s "$NEW" "$SELF"; then
    if bash -n "$NEW" 2> /dev/null; then
      cp "$NEW" "$SELF.tmp" && mv "$SELF.tmp" "$SELF"
      log "script di deploy aggiornato: riparto"
      exec bash "$SELF"
    fi
  fi

  if meta=$(curl -fsSL --max-time 20 "$BASE/VERSION" 2> /dev/null); then
    sha=$(printf '%s\n' "$meta" | sed -n 1p | tr -d '\r ')
    sum=$(printf '%s\n' "$meta" | sed -n 2p | tr -d '\r ')
    last=$(cat "$STATE/last-release" 2> /dev/null || true)
    if [[ "$sha" =~ ^[0-9a-f]{40}$ && "$sum" =~ ^[0-9a-f]{64}$ && "$sha" != "$last" ]]; then
      log "pacchetto nuovo: ${sha:0:7}"
      if deploy "$sha" "$sum"; then log "in produzione: ${sha:0:7}"; else log "DEPLOY FALLITO: ${sha:0:7} (resta la versione precedente)"; fi
      # Segnato come visto anche se è fallito: un pacchetto rotto non si riprova in ciclo.
      echo "$sha" > "$STATE/last-release"
    fi
  fi
  sleep "$EVERY"
done
