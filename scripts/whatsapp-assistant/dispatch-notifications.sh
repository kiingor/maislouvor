#!/usr/bin/env bash
set -euo pipefail
# Executado na VPS pelo timer; o segredo fica no stdin do curl, nunca no argv.
secret_file="/opt/stacks/maislouvor-whatsapp/webhook-secret"
test -s "$secret_file"
python3 - "$secret_file" <<'PY' | curl --config -
import json
import pathlib
import sys
secret = pathlib.Path(sys.argv[1]).read_text().strip()
if not secret or '\n' in secret or '\r' in secret:
    raise SystemExit('Invalid webhook secret')
print('url = "https://api.maislouvor.com/functions/v1/whatsapp-assistant/notifications"')
print('header = ' + json.dumps('x-webhook-secret: ' + secret))
print('request = "POST"\ndata = "{}"\nsilent\nshow-error\nfail\nconnect-timeout = 10\nmax-time = 90')
PY
