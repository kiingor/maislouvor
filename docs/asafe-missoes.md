# Missões agendadas do Asafe

Implementadas sobre a branch feat/assistente-whatsapp, base 3af8d34, junto com os avisos automáticos. **Ainda não publicadas.** O líder pode pedir ao Asafe, no grupo ativado para sua equipe, que guarde uma mensagem e a envie em um horário único, diariamente ou em um ou mais dias da semana.

## Conversa

Marque o contato do Asafe, escreva @Asafe ou responda a uma mensagem dele.

~~~text
Líder: @Asafe avisa toda sexta pra equipe que tem ensaio às 19h
Asafe: Que horas devo mandar o aviso de sexta?
Líder: @Asafe às 17h
Asafe: [confirma o código, texto, sexta às 17h de Brasília e a próxima execução]
~~~

O horário do ensaio não é assumido como horário de envio. A primeira mensagem não cria a missão; a resposta completa o pedido no histórico do mesmo líder e grupo. Se o histórico tiver expirado, o líder repete o pedido completo.

Exemplos de pedidos completos:

- @Asafe toda sexta às 17h avisa que tem ensaio às 19h
- @Asafe todos os dias às 9h avisa que o repertório está no app
- @Asafe agende para amanhã às 15h: tragam os cabos para o ensaio
- @Asafe quais missões estão ativas?
- @Asafe mude a missão ABCD1234 para às 18h
- @Asafe pause a missão ABCD1234
- @Asafe retome a missão ABCD1234
- @Asafe cancele a missão ABCD1234

Os códigos do exemplo são fictícios. O Asafe usa os códigos devolvidos pelo banco e deve pedir esclarecimento se houver mais de uma missão possível. O envio futuro é o texto salvo, com título e código; não executa IA nem busca repertório ou escala naquele horário. Os avisos de escala/repertório/véspera continuam sendo alimentados pelo app, conforme [avisos automáticos](asafe-avisos-automaticos.md).

No app, **Ajustes › Equipe › Missões agendadas** mostra grupo, mensagem, frequência, próximo envio e situação. Permite pausar, retomar e cancelar. Criação e edição são feitas na conversa do grupo de destino. O controle **Avisos do líder** afeta tanto avisos manuais do app quanto missões.

## Regras

- Somente membros com papel admin (líder) criam e gerenciam missões. A checagem no banco usa equipe, grupo e membro resolvidos pelo webhook; esses identificadores não são escolhidos pelo modelo.
- Apenas o grupo do pedido recebe a mensagem, mesmo que a equipe tenha outros grupos. Uma reativação, transferência ou perda de liderança pausa a missão. A autorização e a revisão são conferidas novamente antes de enviar. Um líder atual pode retomar uma missão do grupo de sua equipe e assumir sua autorização.
- Horários de Brasília (America/Sao_Paulo), com precisão de minuto. O timer consulta a agenda a cada minuto; a entrega pode atrasar por fila ou indisponibilidade.
- Frequências: única com data futura; diária; semanal com segunda=1 até domingo=7. Recorrências começam na próxima ocorrência futura. Mensal, quinzenal, intervalos de minutos/horas e recorrências com início/término delimitados ainda não são suportados; o Asafe deve explicar e não trocar silenciosamente a frequência.
- Até 20 missões ativas ou pausadas por equipe/grupo; título até 80 caracteres e mensagem até 1.600. Uma alteração por mensagem. Uma missão cancelada é encerrada; para substituí-la, crie outra.
- Alterar uma missão pausada mantém a pausa. Retomar calcula o próximo horário futuro, sem recuperar execuções da pausa.
- Uma ocorrência atrasada em mais de 15 minutos é descartada e registrada. Uma missão recorrente segue para a próxima ocorrência; um envio único fica expirado. Não despeja vários avisos após uma queda prolongada.
- Desligar Avisos do líder ou suspender o assistente impede os envios e não acumula retroativo.
- Pausa/cancelamento/edição invalidam os eventos da revisão anterior, inclusive os reservados. Um envio que já passou pela autorização final e começou no WhatsApp pode ter chegado; não há como recolhê-lo.
- Falhas antes de iniciar o envio admitem retry dentro da janela de 15 minutos. Timeout após iniciar o envio fica uncertain, sem repetição automática. A próxima ocorrência de uma missão recorrente continua válida. O app mostra a incerteza.
- Não marca todo o grupo. O texto agendado não produz menções a partir de números digitados. Consultas, criação e gestão na conversa seguem a quota de perguntas existente; os envios programados não gastam IA/quota.

## Implementação e publicação

A migração 20260930120000_assistant_missions.sql exige as migrações do assistente (20260928120000) e dos avisos (20260929120000). Cria assistant_missions e assistant_mission_requests com RLS e sem acesso direto do navegador. Apenas as RPCs autenticadas assistant_missions_overview e assistant_set_mission_state ficam disponíveis no app, com checagem de liderança.

A RPC assistant_mission_command valida e salva a agenda em transação; comandos são idempotentes por grupo e ID da mensagem do WhatsApp. A edição incrementa a revisão. A RPC assistant_mission_tick reserva cada ocorrência na mesma assistant_outbox dos avisos e avança a agenda, sob lock transacional. A chave única por missão/revisão/horário impede duplicatas do timer. O recibo da entrega atualiza a situação resumida da missão; comandos de conversa ficam 90 dias, recibos da fila 30 dias.

O arquivo missions.ts declara as ferramentas e filtra pedidos de ação. O handler também recusa ferramentas que não foram autorizadas naquela mensagem. Conteúdo citado de outra pessoa não autoriza uma missão. O horário de envio precisa estar no pedido ou na resposta de esclarecimento, separado do conteúdo do evento.

Publicar **as duas migrações novas, em ordem, antes da edge function**. Usar o roteiro em [avisos automáticos](asafe-avisos-automaticos.md). Não criar outro cron: o mesmo timer chama /notifications, que consulta véspera e missões antes de consumir a fila. Não executar esse endpoint como teste de saúde, pois ele pode enviar avisos reais.

O backend atende também quem usa APK antigo. A lista e os controles novos no app com bundle embutido exigem uma próxima versão do APK; nenhum APK foi gerado nesta mudança.

Depois de publicar, validar em grupo de teste autorizado: pedido incompleto, complemento do horário, missão única futura, pausa, edição e cancelamento. Os testes locais simulam OpenAI/WhatsApp; não são prova de interpretação pelo modelo real nem de entrega real da Evolution.

## Verificação local

~~~sh
PGLITE_MODULE=/caminho/pglite/dist/index.js node supabase/tests/whatsapp_missions.mjs
PGLITE_MODULE=/caminho/pglite/dist/index.js node supabase/tests/whatsapp_notifications.mjs
PGLITE_MODULE=/caminho/pglite/dist/index.js node supabase/tests/whatsapp_notifications_schema.mjs /caminho/schema-public.sql
VITE_SUPABASE_URL=https://tests.example.invalid VITE_SUPABASE_PUBLISHABLE_KEY=test-anon-key npm test -- --cache=false
deno check supabase/functions/whatsapp-assistant/index.ts
~~~

O teste de missões executa PostgreSQL real em memória (PGlite), com handler e dispatcher reais e serviços externos simulados. Cobre calendário, fuso, permissões, transferência de grupo, idempotência, atraso, retry, cancelamento durante a reserva, controles no app e conversa com esclarecimento. O teste de schema completo reaplica as migrações e verifica os grants/RLS e operações autenticadas. Para build de publicação, use as variáveis públicas oficiais do frontend, conforme o processo da release; valores fictícios são apenas para testes.
