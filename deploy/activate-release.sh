#!/usr/bin/env bash
# Aktifkan release yang sudah di-upload ke $DEPLOY_PATH/releases/$RELEASE_ID.
# Dipakai GitHub Actions setelah SCP; .env production tetap di $DEPLOY_PATH/.env.
set -euo pipefail

DEPLOY_PATH="${1:?DEPLOY_PATH wajib}"
RELEASE_ID="${2:?RELEASE_ID wajib}"
RELEASE_DIR="$DEPLOY_PATH/releases/$RELEASE_ID"
ENV_FILE="$DEPLOY_PATH/.env"

if [[ ! -d "$RELEASE_DIR" ]]; then
  echo "Release tidak ditemukan: $RELEASE_DIR" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Berkas .env production tidak ada di $ENV_FILE" >&2
  exit 1
fi

cd "$RELEASE_DIR"
ln -sfn "$ENV_FILE" .env

npm ci --omit=dev
npm run db:migrate:deploy

ln -sfn "$RELEASE_DIR" "$DEPLOY_PATH/current"
sudo systemctl restart warehouse

cd "$DEPLOY_PATH/releases"
# Keep the two newest releases; remove the rest.
mapfile -t old_releases < <(ls -1dt */ 2>/dev/null | tail -n +3 || true)
if ((${#old_releases[@]} > 0)); then
  rm -rf "${old_releases[@]}"
fi

echo "Release $RELEASE_ID aktif di $DEPLOY_PATH/current"
