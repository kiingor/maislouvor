# Avisos automáticos do Asafe

Implementação sobre `feat/assistente-whatsapp`, base `3af8d34`. **Ainda não publicada.** Os avisos usam as mudanças salvas no app e os grupos já ativados pelo líder, inclusive quando ninguém fala com o Asafe e quando o app está fechado.

## Comportamento

| Aviso | Quando sai | Quem recebe menção |
|---|---|---|
| Novo culto | Culto criado para hoje ou data futura | Escalados, se a escala já foi salva no mesmo lote |
| Escala | Inclusão, troca de função ou remoção | Pessoas afetadas, uma menção por pessoa |
| Culto atualizado | Mudança de data, nome ou observações | Escalados ativos quando muda a data |
| Cancelamento | Culto removido da agenda | Escalados que não recusaram |
| Repertório | Música incluída/removida, ordem ou tom alterado | Sem marcação geral |
| Aviso do líder | “Enviar aviso ao time”, por um líder | Sem marcação geral |
| Véspera | A partir das 18h de Brasília, para os cultos de amanhã | Escalados que não recusaram; destaca confirmações pendentes |
| Missão agendada | Horário único, diário ou semanal pedido pelo líder no grupo | Sem marcação geral |

Exemplo (o WhatsApp substitui o identificador da menção pelo nome do contato):

```text
🎼 *Culto de Domingo* · dom., 04/10/2026
Eiii, tu foi escalado pra esse culto! 🎶
• @Filipe — Violão
Confirma tua participação no app ou me chama aqui com o nome do culto.
```

Em **Ajustes › Equipe › Avisos automáticos**, o líder liga/desliga cada categoria. Os cinco tipos começam ligados. As instruções do ministério continuam sendo contexto de resposta: editar esse texto não publica um aviso no grupo. Avisos manuais de usuários sem papel de líder continuam apenas no app.

Não há retroativo de cultos ou escalas antigos. O lembrete é programado para a véspera de cultos futuros; se o serviço voltar entre 18h e 21h, recupera o lembrete daquele dia. Depois das 21h não envia lembrete atrasado. O modelo atual armazena a data do culto, sem horário: o Asafe não inventa um horário.

As [missões agendadas](asafe-missoes.md) usam essa mesma fila e timer. O controle **Avisos do líder** também controla as missões. Elas são presas ao grupo do pedido e têm janela de atraso própria de 15 minutos.

## Entrega e identidade

- Triggers transacionais em `cultos`, `culto_lineup`, `culto_songs`, `songs` e `notifications` alimentam `assistant_outbox`; um save revertido também reverte a fila.
- Alterações do mesmo culto/grupo ficam agrupadas por 45 segundos após a última edição (até cinco minutos de espera). Com o timer de um minuto, normalmente chegam em cerca de um a dois minutos. O estado final é comparado ao anterior: salvar sem mudança não reanuncia a escala. Confirmar/recusar também não gera outro anúncio.
- Cada entrega guarda equipe, grupo e instante de ativação. A autorização é conferida ao reservar e imediatamente antes de enviar. Desconectar, reativar ou transferir um grupo não encaminha dados antigos de outro ministério. Uma transferência de culto também não mistura seus dados entre equipes.
- Consulta os participantes atuais do grupo e cruza com os membros daquela equipe. Vínculo pessoal por código tem precedência; telefone ambíguo, pessoa ausente ou sem vínculo resulta em nome simples, sem falsa menção. Trocar o telefone elimina vínculos aprendidos pelo número anterior, preservando vínculos pessoais por código.
- A Evolution recebe `mentioned` com os JIDs resolvidos (`@lid` ou `@s.whatsapp.net`). Nunca recebe `mentionsEveryOne`. Contrato conferido no [código da Evolution 2.3.7](https://github.com/EvolutionAPI/evolution-api/blob/2.3.7/src/api/integrations/channel/whatsapp/whatsapp.baileys.service.ts).
- Listas extensas são divididas em mensagens de até cerca de 3.500 caracteres, mantendo cada menção junto ao nome/função correspondente. A autorização é conferida antes de cada parte; uma entrega parcial com falha fica `uncertain`, sem repetição automática das partes já enviadas.
- Respostas e avisos não compartilham a quota: os avisos são textos determinísticos, sem chamada de IA. Não incluem motivos de indisponibilidade, telefone em texto, credenciais nem links públicos de compartilhamento. Uma menção de telefone, quando necessária, usa o JID que o WhatsApp já fornece ao grupo.
- Antes do envio, falhas podem ser repetidas até cinco tentativas com espera crescente. Após começar o envio, um timeout é `uncertain` e exige conferência operacional; repetir automaticamente poderia duplicar uma mensagem já entregue. Isso também cobre queda entre entrega e confirmação no banco. Não há promessa de entrega exatamente uma vez, pois a Evolution não fornece transação conjunta com o banco.
- A fila vence em 24h e os registros terminais ficam por 30 dias. Logs têm apenas ID e estado, sem texto/telefone.

## Publicação

Não depende de atualizar o APK para gerar avisos: os eventos vêm do banco. Os controles novos exigem o frontend atualizado; no APK com web embutida, entram no próximo APK. Não substituir o site por uma build de `main`, que está atrás desta branch.

1. Fazer backup do schema e ensaiar `supabase/migrations/20260929120000_assistant_notifications.sql` em transação revertida. Aplicar a migração com transação e `lock_timeout`, seguindo o processo da release do Asafe. Ela exige a migração anterior `20260928120000_whatsapp_assistant.sql`.
   Depois da migração de avisos, aplicar também **20260930120000_assistant_missions.sql**, com as mesmas verificações, antes de publicar a função. O backend desta entrega exige ambas as migrações novas.
2. Publicar a pasta completa `supabase/functions/whatsapp-assistant/`. O endpoint protegido novo é `POST /functions/v1/whatsapp-assistant/notifications`, com o segredo existente no cabeçalho `x-webhook-secret`. A chamada consome a fila e pode enviar mensagens: não é um endpoint de saúde.
3. Instalar o timer na VPS usando os arquivos desta mudança:

   ```sh
   install -m 755 scripts/whatsapp-assistant/dispatch-notifications.sh /opt/stacks/maislouvor-whatsapp/
   install -m 644 scripts/whatsapp-assistant/maislouvor-whatsapp-notifications.service /etc/systemd/system/
   install -m 644 scripts/whatsapp-assistant/maislouvor-whatsapp-notifications.timer /etc/systemd/system/
   systemctl daemon-reload
   systemctl enable --now maislouvor-whatsapp-notifications.timer
   ```

   O script usa o arquivo de segredo já existente e passa o cabeçalho ao curl por stdin. Nenhum segredo novo, alteração no Talitha ou dependência de `pg_cron`/`pg_net`.
4. Publicar o frontend pelo processo habitual. Fazer smoke autorizado num grupo de teste vinculado a uma equipe de teste: novo culto, escala, troca de função, repertório e aviso manual. Conferir a menção no WhatsApp real. Os testes automatizados não enviam mensagens reais.

Para pausar apenas os avisos: `systemctl stop maislouvor-whatsapp-notifications.timer`. Respostas a perguntas continuam funcionando. Para desligar definitivamente, desabilitar o timer e as preferências antes de retirar a função; os eventos da fila expiram sem reenvio retroativo. Nunca reenfileirar registros `uncertain` sem conferir o grupo.

Consulta operacional sem ler conteúdo das mensagens:

```sql
select status, count(*) from assistant_outbox group by status;
select id, kind, attempts, error_code, created_at, updated_at
from assistant_outbox where status in ('failed','uncertain') order by updated_at desc;
```

## Validação local

```sh
node supabase/tests/whatsapp_assistant_units.mjs
PGLITE_MODULE=/caminho/pglite/dist/index.js node supabase/tests/whatsapp_assistant.mjs
PGLITE_MODULE=/caminho/pglite/dist/index.js node supabase/tests/whatsapp_assistant_flow.mjs
PGLITE_MODULE=/caminho/pglite/dist/index.js node supabase/tests/whatsapp_notifications.mjs
PGLITE_MODULE=/caminho/pglite/dist/index.js node supabase/tests/whatsapp_missions.mjs
PGLITE_MODULE=/caminho/pglite/dist/index.js node supabase/tests/whatsapp_notifications_schema.mjs /caminho/schema-public.sql
VITE_SUPABASE_URL=https://tests.example.invalid VITE_SUPABASE_PUBLISHABLE_KEY=test-anon-key npm test -- --cache=false
npm run build
deno check supabase/functions/whatsapp-assistant/index.ts
deno lint --rules-exclude=no-import-prefix supabase/functions/whatsapp-assistant
```

`no-import-prefix` é excluída porque a função já usa o import HTTP do Supabase, aceito no edge runtime. O typecheck geral do app tem erros preexistentes nos tipos de `team_join_requests`, `duration_seconds` e promises em outros componentes; a mudança não acrescentou erros nesses checks. Detalhes dos resultados da sessão estão no pacote de aplicação.
