#!/usr/bin/env bash
# Instalado como root; senha e repositório não ficam no Git.
set -euo pipefail
umask 077
exec 9>/run/lock/maislouvor-backup.lock
flock -n 9 || exit 0
export RESTIC_REPOSITORY=/var/backups/maislouvor-managed/restic
export RESTIC_PASSWORD_FILE=/etc/maislouvor-backup/password
export GOMEMLIMIT=512MiB
STAGING=/var/lib/maislouvor-backup
mkdir -p "$STAGING"
trap 'rm -f "$STAGING/postgres.dump.partial" "$STAGING/postgres.dump" "$STAGING/supabase.env" "$STAGING/docker-compose.yml"; rm -rf "$STAGING/config"' EXIT
docker exec supabase-db pg_dump -U postgres -d postgres -Fc > "$STAGING/postgres.dump.partial"
docker exec -i supabase-db pg_restore --list < "$STAGING/postgres.dump.partial" >/dev/null
mv "$STAGING/postgres.dump.partial" "$STAGING/postgres.dump"
# Configuração sensível é criptografada junto. Sem dados de outros projetos.
install -m 600 /opt/supabase/docker-compose.yml "$STAGING/docker-compose.yml"
install -m 600 /opt/supabase/.env "$STAGING/supabase.env"
mkdir -p "$STAGING/config"
for file in /opt/supabase/.env.*; do
  [ ! -f "$file" ] || install -m 600 "$file" "$STAGING/config/$(basename "$file")"
done
printf '{"format":1,"created_at":"%s","database":"postgres","storage":"/opt/supabase/volumes/storage"}\n' "$(date -u +%FT%TZ)" > "$STAGING/manifest.json"
restic backup --tag maislouvor-daily "$STAGING" /opt/supabase/volumes/storage /opt/supabase/volumes/functions
# Janela temporal, sem keep-last que conservaria dados além do prazo declarado.
restic forget --tag maislouvor-daily --keep-within 30d --prune
restic check
rm -f "$STAGING/postgres.dump" "$STAGING/supabase.env" "$STAGING/docker-compose.yml"
