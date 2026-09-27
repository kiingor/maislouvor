#!/usr/bin/env bash
# Instância "maislouvor" (número do assistente) na Evolution API que já roda na
# VPS, dentro da stack talitha-cume. Roteiro completo: docs/assistente-whatsapp.md.
#
# Roda NA VPS, como root. As chamadas saem de dentro do container da Evolution,
# com a chave global que já está no ambiente dele (AUTHENTICATION_API_KEY):
# nenhuma chave aparece na linha de comando, na lista de processos ou na tela.
# O token da instância e o segredo do webhook ficam em $STATE_DIR (modo 600).
#
#   evolution-instance.sh network            rede só entre a Evolution e as edge functions
#   evolution-instance.sh create             cria a instância e os segredos
#   evolution-instance.sh configure          grupos ligados, recusa ligações e webhook
#   evolution-instance.sh pair 5511999999999 código de pareamento (conectar com número)
#   evolution-instance.sh qr                 QR code em $STATE_DIR/qr.png
#   evolution-instance.sh status             estado da conexão
#   evolution-instance.sh restart            reinicia a sessão (webhook parou de chegar)
set -euo pipefail

CONTAINER="${EVOLUTION_CONTAINER:-talitha-cume-evolution-1}"
FUNCTIONS_CONTAINER="${FUNCTIONS_CONTAINER:-supabase-edge-functions}"
NETWORK="${WHATSAPP_NETWORK:-maislouvor-whatsapp}"
INSTANCE="${WHATSAPP_EVOLUTION_INSTANCE:-maislouvor}"
STATE_DIR="${STATE_DIR:-/opt/stacks/maislouvor-whatsapp}"
TOKEN_FILE="$STATE_DIR/instance-token"
SECRET_FILE="$STATE_DIR/webhook-secret"
# Pela rede interna, direto no edge-runtime (sem passar por Caddy/Kong).
WEBHOOK_BASE="${WEBHOOK_BASE:-http://$FUNCTIONS_CONTAINER:9000/whatsapp-assistant}"
# Endereço da API visto de dentro do container da Evolution.
EVOLUTION_LOCAL_URL="${EVOLUTION_LOCAL_URL:-http://127.0.0.1:8080}"

# evo MÉTODO CAMINHO [JSON] -> resposta JSON na saída padrão.
# O corpo vai pela entrada padrão, nunca como argumento de processo. A Evolution
# da VPS recusa (CORS) quem não manda a origem de CORS_ORIGIN, até entre servidores.
evo() {
  local method="$1" path="$2" body="${3:-}"
  printf '%s' "$body" | docker exec -i "$CONTAINER" node -e '
    const [base, method, path] = process.argv.slice(1);
    const body = require("fs").readFileSync(0, "utf8").trim();
    fetch(base + path, {
      method,
      headers: {
        apikey: process.env.AUTHENTICATION_API_KEY,
        "Content-Type": "application/json",
        ...(process.env.CORS_ORIGIN && process.env.CORS_ORIGIN !== "*"
          ? { Origin: process.env.CORS_ORIGIN.split(",")[0].trim() } : {}),
      },
      body: body || undefined,
    }).then(async (response) => {
      const text = await response.text();
      if (!response.ok) {
        console.error(`HTTP ${response.status}: ${text.slice(0, 500)}`);
        process.exit(1);
      }
      process.stdout.write(text + "\n");
    }).catch((error) => {
      console.error(error.message);
      process.exit(1);
    });
  ' "$EVOLUTION_LOCAL_URL" "$method" "$path"
}

json_field() {
  python3 -c 'import json, sys
data = json.load(sys.stdin)
for key in sys.argv[1:]:
    value = data.get(key) if isinstance(data, dict) else None
    if value:
        print(value)
        break' "$@"
}

new_secret() {
  [ -s "$1" ] && return 0
  (umask 077 && openssl rand -hex 24 >"$1")
}

case "${1:-}" in
  network)
    docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null
    for container in "$CONTAINER" "$FUNCTIONS_CONTAINER"; do
      docker network connect "$NETWORK" "$container" 2>/dev/null || true
    done
    echo "Rede $NETWORK ligando $CONTAINER e $FUNCTIONS_CONTAINER."
    echo "Para sobreviver a um 'docker compose up', declare a rede nos dois compose (veja a documentação)."
    ;;
  create)
    install -d -m 700 "$STATE_DIR"
    new_secret "$TOKEN_FILE"
    new_secret "$SECRET_FILE"
    evo POST /instance/create "$(printf '{"instanceName":"%s","integration":"WHATSAPP-BAILEYS","qrcode":false,"token":"%s"}' \
      "$INSTANCE" "$(cat "$TOKEN_FILE")")" >/dev/null
    echo "Instância $INSTANCE criada. Token em $TOKEN_FILE, segredo do webhook em $SECRET_FILE."
    ;;
  configure)
    [ -s "$SECRET_FILE" ] || { echo "Rode 'create' antes." >&2; exit 1; }
    evo POST "/settings/set/$INSTANCE" '{"rejectCall":true,"msgCall":"Oi! Sou o assistente do +Louvor e não atendo ligações. Me marque no grupo do ministério 🎺","groupsIgnore":false,"alwaysOnline":false,"readMessages":false,"readStatus":false,"syncFullHistory":false}' >/dev/null
    evo POST "/webhook/set/$INSTANCE" "$(printf '{"webhook":{"enabled":true,"url":"%s/%s","webhookByEvents":false,"webhookBase64":false,"events":["MESSAGES_UPSERT","SEND_MESSAGE","GROUP_PARTICIPANTS_UPDATE","CONNECTION_UPDATE"]}}' \
      "$WEBHOOK_BASE" "$(cat "$SECRET_FILE")")" >/dev/null
    echo "Ajustes e webhook aplicados em $INSTANCE (webhook em $WEBHOOK_BASE/<segredo>)."
    ;;
  pair)
    number="$(printf '%s' "${2:-}" | tr -cd '0-9')"
    [ -n "$number" ] || { echo "Uso: $0 pair 5511999999999" >&2; exit 1; }
    code="$(evo GET "/instance/connect/$INSTANCE?number=$number" | json_field pairingCode code)"
    echo "No celular do número: WhatsApp › Aparelhos conectados › Conectar aparelho › Conectar com número de telefone"
    echo "Código: $code"
    ;;
  qr)
    install -d -m 700 "$STATE_DIR"
    # Quem escaneia este QR conecta o número: arquivo só do root, apague depois de usar.
    evo GET "/instance/connect/$INSTANCE" | json_field base64 | sed 's/^data:image\/png;base64,//' \
      | (umask 077 && base64 -d >"$STATE_DIR/qr.png")
    echo "QR code em $STATE_DIR/qr.png (copie com scp, escaneie em Aparelhos conectados e apague o arquivo)."
    ;;
  status)
    evo GET "/instance/connectionState/$INSTANCE"
    ;;
  restart)
    evo POST "/instance/restart/$INSTANCE" >/dev/null
    echo "Sessão de $INSTANCE reiniciada."
    ;;
  *)
    sed -n '2,16p' "$0"
    exit 1
    ;;
esac
