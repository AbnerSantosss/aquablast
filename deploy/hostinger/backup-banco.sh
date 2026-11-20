#!/bin/sh
# Backup diário do banco do AquaBlast na VPS Hostinger.
# Instalado em /opt/aquablast/backup-banco.sh e chamado por /etc/cron.d/aquablast-backup.
# Formato custom do pg_dump (-Fc): restaura com pg_restore, tabela por tabela se precisar.
# O arquivo tem dados de cliente (nome, endereço, e-mail; CPF cifrado): pasta só do root.
set -eu
DIR=/opt/backups/aquablast
DIAS=14
mkdir -p "$DIR"
chmod 700 "$DIR"
ARQ="$DIR/aquablast-$(date +%Y%m%d-%H%M).dump"
docker exec aquablast-db pg_dump -U aquablast -d aquablast -Fc > "$ARQ.tmp"
mv "$ARQ.tmp" "$ARQ"
chmod 600 "$ARQ"
find "$DIR" -name 'aquablast-*.dump' -mtime +"$DIAS" -delete
echo "$(date -u +%FT%TZ) backup ok: $ARQ ($(du -h "$ARQ" | cut -f1))"
