#!/usr/bin/env bash
# Publish a version of the app image to the Yelema host.
#
#   scripts/build-image.sh vX.Y.Z
#
# 1. builds agent37-app:vX.Y.Z for linux/amd64 (APP_VERSION baked in, nothing client-specific)
# 2. streams it to $DEPLOY_HOST (default mstudio-vps) with `docker load` — no container is started
# 3. on the host, removes older agent37-app tags, keeping this version and the previous one
#    (scoped to agent37-app: the host is shared, so no global `docker image prune`)
# 4. copies supabase/migrations/*.sql to $BACKOFFICE_DIR/assets/agent37-app/vX.Y.Z/
#
# Env: DEPLOY_HOST (mstudio-vps), BACKOFFICE_DIR (~/yelema-platform), SKIP_SHIP=1 to build only.
set -euo pipefail

VERSION="${1:-}"
if [[ ! "$VERSION" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "usage: $0 vX.Y.Z" >&2
  exit 1
fi

IMAGE="agent37-app"
HOST="${DEPLOY_HOST:-mstudio-vps}"
BACKOFFICE_DIR="${BACKOFFICE_DIR:-$HOME/yelema-platform}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Building $IMAGE:$VERSION (linux/amd64)"
docker buildx build --platform linux/amd64 --build-arg "APP_VERSION=$VERSION" \
  --load -t "$IMAGE:$VERSION" .
docker image ls "$IMAGE:$VERSION"

if [[ "${SKIP_SHIP:-}" == "1" ]]; then
  echo "==> SKIP_SHIP=1: built only"
  exit 0
fi

echo "==> Loading into $HOST"
docker save "$IMAGE:$VERSION" | gzip | ssh -o BatchMode=yes "$HOST" 'gunzip | docker load'

echo "==> Keeping $VERSION and the previous version of $IMAGE on $HOST"
ssh -o BatchMode=yes "$HOST" "IMAGE=$IMAGE bash -s" <<'REMOTE'
set -euo pipefail
tags=$(docker image ls "$IMAGE" --format '{{.Tag}}' | grep -E '^v[0-9]+\.[0-9]+\.[0-9]+$' | sort -V -r || true)
old=$(echo "$tags" | tail -n +3)
for t in $old; do docker image rm "$IMAGE:$t" || true; done
docker image ls "$IMAGE"
REMOTE

DEST="$BACKOFFICE_DIR/assets/$IMAGE/$VERSION"
if [[ -d "$BACKOFFICE_DIR" ]]; then
  echo "==> Copying migrations to $DEST"
  mkdir -p "$DEST"
  cp supabase/migrations/*.sql "$DEST/"
  ls "$DEST"
else
  echo "==> $BACKOFFICE_DIR not found: copy supabase/migrations/*.sql to assets/$IMAGE/$VERSION/ yourself"
fi

echo "==> Published $IMAGE:$VERSION"
