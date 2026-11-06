#!/usr/bin/env sh
# Build and start StackQuest with Docker Compose. Safe to re-run (also how you update).
set -eu
cd "$(dirname "$0")"

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker with the Compose plugin is required: https://docs.docker.com/engine/install/" >&2
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.homelab.example .env
  pw=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
  sed -i.bak "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$pw/" .env && rm -f .env.bak
  chmod 600 .env
  echo "Created .env with a generated database password."
fi

app_url=$(sed -n 's/^APP_URL=//p' .env)
if [ -z "$app_url" ]; then
  printf "Public address people will use (e.g. https://learn.example.com or http://192.168.1.50:3000): "
  read -r app_url
  case "$app_url" in http://*|https://*) ;; *) echo "It must start with http:// or https://" >&2; exit 1 ;; esac
  app_url=${app_url%/}
  sed -i.bak "s|^APP_URL=.*|APP_URL=$app_url|" .env && rm -f .env.bak
fi

mkdir -p backups
profile=""
if [ -n "$(sed -n 's/^CLOUDFLARE_TUNNEL_TOKEN=//p' .env)" ]; then profile="--profile tunnel"; fi

echo "Building and starting (the first build takes a few minutes)..."
# shellcheck disable=SC2086
docker compose $profile up -d --build

printf "Waiting for the app to become healthy"
i=0
until [ "$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null)" = "healthy" ]; do
  i=$((i + 1))
  if [ "$i" -gt 60 ]; then echo; echo "Not healthy after 5 minutes. Check: docker compose logs app" >&2; exit 1; fi
  printf "."; sleep 5
done
echo
echo "StackQuest is running. Open $app_url and create the first account."
