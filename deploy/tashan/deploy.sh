#!/usr/bin/env bash
set -euo pipefail
IMAGE="${1:?immutable image required}"
UID_NAME="${2:?preview UID required}"
REVISION="${3:?revision required}"
BRANCH="${4:?source branch required}"
[[ "$IMAGE" =~ ^ghcr.io/tashangkd/tashan-tuyan@sha256:[a-f0-9]{64}$ ]]
[[ "$UID_NAME" =~ ^tashan-tuyan-[a-z0-9-]+$ && ${#UID_NAME} -le 63 ]]
[[ "$REVISION" =~ ^[a-f0-9]{40}$ ]]
[[ "$BRANCH" =~ ^codex/[A-Za-z0-9._/-]+$ ]]
CONTAINER="container-$UID_NAME"
VOLUME="data-$UID_NAME"
DOMAIN="$UID_NAME.tashan.chat"
STATE="$HOME/tuyan-previews/$UID_NAME"
SHARED_SCRIPT=/var/www/github-actions/configs/scripts/deploy-subdomain.sh
mkdir -p "$STATE"
chmod 700 "$STATE"
exec 9>"$STATE/deploy.lock"
flock -n 9 || { echo 'A deployment for this preview is already running'; exit 1; }
if [[ -f "$STATE/branch" ]] && [[ "$(cat "$STATE/branch")" != "$BRANCH" ]]; then
  echo 'Branch slug collision; refusing to reuse another branch volume'; exit 1
fi
printf '%s' "$BRANCH" > "$STATE/branch"
[[ -s "$STATE/external.json" ]]
docker pull "$IMAGE"
docker volume inspect "$VOLUME" >/dev/null 2>&1 || docker volume create "$VOLUME" >/dev/null
# Only this preview's configuration is copied. No host secrets or Docker socket.
docker run --rm -i --network none --entrypoint /bin/sh \
  --mount "type=volume,src=$VOLUME,dst=/data" "$IMAGE" \
  -c 'umask 077; cat > /data/external.json' < "$STATE/external.json"
OLD_IMAGE="$(docker inspect "$CONTAINER" --format '{{.Config.Image}}' 2>/dev/null || true)"
configure_own_site() {
  local port
  port="$(docker port "$CONTAINER" 8080/tcp | head -n1 | awk -F: '{print $NF}')" || return 1
  [[ "$port" =~ ^[0-9]+$ ]] || return 1
  sudo test -s "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" || return 1
  # The shared script remains untouched. Preserve HTTPS for this site's redeploys.
  sudo tee "/etc/nginx/sites-enabled/$UID_NAME.conf" >/dev/null <<EOF || return 1
server {
  listen 80;
  server_name $DOMAIN;
  return 301 https://\$host\$request_uri;
}
server {
  listen 443 ssl;
  server_name $DOMAIN;
  ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;
  client_max_body_size 16m;
  location / {
    proxy_pass http://127.0.0.1:$port;
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_buffering off;
    proxy_read_timeout 900s;
  }
}
EOF
  sudo nginx -t || return 1
  sudo systemctl reload nginx || return 1
}
start_image() {
  bash "$SHARED_SCRIPT" "$1" "$UID_NAME" "$CONTAINER" "" 8080 /data || return 1
  docker update --memory 3g --memory-swap 3g --cpus 1.5 --pids-limit 256 "$CONTAINER" >/dev/null || return 1
  configure_own_site || return 1
  for _ in {1..60}; do
    [[ "$(docker inspect "$CONTAINER" --format '{{.State.Health.Status}}')" == healthy ]] && return 0
    sleep 5
  done
  return 1
}
if ! (set -e; start_image "$IMAGE"); then
  echo 'Preview deployment did not become healthy.'
  if [[ -n "$OLD_IMAGE" && "$OLD_IMAGE" != "$IMAGE" ]]; then
    echo 'Restoring this preview previous image; retaining its data volume.'
    (set -e; start_image "$OLD_IMAGE") || echo 'Previous preview could not be restored.'
  fi
  exit 1
fi
curl --fail --silent --show-error --max-time 15 "https://$DOMAIN/ready" >/dev/null
printf '{"revision":"%s","image":"%s","origin":"https://%s"}\n' "$REVISION" "$IMAGE" "$DOMAIN" > "$STATE/last-success.json"
echo "Preview healthy: https://$DOMAIN/"
