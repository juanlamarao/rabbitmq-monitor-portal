#!/usr/bin/env bash

set -euo pipefail

DIRECTORY="${1:-.}"

if ! command -v dos2unix >/dev/null 2>&1; then
    echo "Erro: dos2unix não está instalado."
    exit 1
fi

if [[ ! -d "$DIRECTORY" ]]; then
    echo "Erro: diretório não encontrado: $DIRETORY"
    exit 1
fi

echo "Convertendo arquivos em: $DIRECTORY"

find "$DIRECTORY" \
    -type d -name ".git" -prune -o \
    -type f \
    ! -iname "*.png" \
    ! -iname "*.svg" \
    -exec dos2unix -- {} +

echo "Conversão concluída."
