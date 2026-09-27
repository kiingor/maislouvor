#!/usr/bin/env bash
# Mantém a Evolution (stack talitha-cume) e as edge functions do +Louvor na rede
# privada maislouvor-whatsapp, sem editar o compose de nenhuma das duas stacks
# (o Talitha Cume é publicado por releases e perderia qualquer edição).
#
# "docker compose up" recria o container sem a rede extra; este serviço
# (systemd: maislouvor-whatsapp-network.service) religa a cada start.
set -u

NETWORK="${WHATSAPP_NETWORK:-maislouvor-whatsapp}"
CONTAINERS="${WHATSAPP_NETWORK_CONTAINERS:-talitha-cume-evolution-1 supabase-edge-functions}"

attach() {
  docker network inspect "$NETWORK" >/dev/null 2>&1 || docker network create "$NETWORK" >/dev/null
  for container in $CONTAINERS; do
    docker inspect "$container" >/dev/null 2>&1 || continue
    if ! docker inspect -f '{{json .NetworkSettings.Networks}}' "$container" | grep -q "\"$NETWORK\""; then
      docker network connect "$NETWORK" "$container" && echo "$container ligado a $NETWORK"
    fi
  done
}

attach
# A cada container iniciado (recriado pelo compose, reiniciado, boot), confere de novo.
docker events --filter type=container --filter event=start --format '{{.Actor.Attributes.name}}' |
  while read -r name; do
    case " $CONTAINERS " in *" $name "*) attach ;; esac
  done
