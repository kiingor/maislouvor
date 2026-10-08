# Escopo corrigido: Asafe e separação local preservados — 07/10/2026

Filipe esclareceu que a remoção deve atingir **somente a sugestão de músicas por IA e a importação do Moises**. Asafe deve permanecer completo. A separação de faixas com IA local (Demucs) é um recurso primordial e muito utilizado, que deve permanecer.

## Estado efetivo

- **Asafe:** não foi removido. O endpoint de saúde autenticado retornou HTTP 200, `ok`, `evolution` e `openai` verdadeiros antes e depois da correção. `assistant_config.enabled` permanece verdadeiro. Nenhuma configuração ou fonte do Asafe foi substituída, nenhum grupo/vínculo foi alterado e nenhuma mensagem foi enviada para testar.
- **Separação de faixas:** não foi removida. `separate-stems`, `stems-callback`, o worker e o acionamento pelo editor foram preservados. A função de iniciar separação no editor é idêntica à anterior à retirada; os arquivos locais do worker e endpoints continuam idênticos ao HEAD. O container `demucs-worker` estava e permanece em execução, com zero reinícios registrados. Seu ID e horário de início não mudaram durante a correção. A fila consultada continha 101 tarefas concluídas e nenhuma pendente/em execução/falha; não foi criada uma separação nova nesta verificação.
- **Apenas duas rotas retiradas:** `suggest-culto-songs` e `import-moises` continuam respondendo 410 / `FEATURE_REMOVED`. Seus botões/formulários permanecem removidos no checkout de lojas.
- **Ampliação indevida revertida:** `import-cifra`, `sync-lyrics` e `transpose` voltaram exatamente às fontes anteriores do servidor, verificadas por SHA-256 contra o backup privado. No checkout, restauradas as versões anteriores à remoção, inclusive a dependência de consentimento ainda não publicada. Restaurados `_shared/aiConsent.ts`, seu teste e `ai-disclosure`; este último continua somente local. Isso não cria novos botões no app.

## Aplicação

`scripts/lojas/restore-extra-music-functions.py` executado primeiro em conferência e depois com `--apply`. A restauração alterou somente os três arquivos adicionais e reiniciou exclusivamente o serviço de funções. Preservados imagem, ambiente (incluindo Apple e RevenueCat) e hashes de todas as demais fontes. Nenhum banco, conteúdo ou credencial foi alterado.

Registro privado e backup da correção em `/var/lib/maislouvor-deploy/20261007-restore-extra-music-functions/`. As três rotas restauradas retornaram 400 ao corpo vazio, rejeitado antes de processar dados; as duas removidas continuaram retornando 410. Asafe saudável e Demucs com o mesmo processo após a aplicação. O instalador antigo de retirada também foi restringido às duas rotas solicitadas; os instaladores recusam reaplicação sobre os registros de deploy existentes.

## Validação

- 33 testes das telas/configurações/missões/consentimento do Asafe aprovados.
- 94 verificações integradas do Asafe, com PostgreSQL em memória, aprovadas.
- 140 verificações unitárias do Asafe aprovadas. Encontradas expectativas antigas que ainda permitiam IA sem o aceite atual; foram alinhadas à mudança de consentimento implementada anteriormente. Foi alterado apenas o teste, sem alterar comportamento ou publicar nova versão do Asafe.
- `deno check` aprovado nos três endpoints restaurados e em `ai-disclosure`; teste do consentimento compartilhado aprovado.
- Sintaxe dos dois scripts e `git diff --check` aprovados. Evidências em `tmp/restore-music-scope/` e `tmp/asafe-scope-tests.log`.

Esta etapa não executou conversa real pelo WhatsApp nem uma nova separação completa de áudio. Verificou integridade, configuração, disponibilidade dos serviços e fluxos em testes isolados. Nenhum frontend, TestFlight, commit, push ou merge foi publicado. A integração de assinaturas publicada em outra sessão foi preservada.

Os registros anteriores de retirada ampla são históricos e estão sinalizados com esta correção. O consentimento do Asafe é independente da integração retirada, assim como o processamento local do Demucs; não removê-los em limpezas futuras dessa funcionalidade.
