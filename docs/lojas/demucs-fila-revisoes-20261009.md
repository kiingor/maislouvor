# Separação de faixas: autorização e revisões

Estado: **backend e workers publicados em 09/10/2026 às 17:23:46 BRT**.
Commits: `37c13db` (backend/worker/testes), `fbc8dad` (fontes imutáveis web),
`7cf6760` (diagnóstico StoreKit). A publicação do web fica na frente coordenadora;
este relatório não afirma que o web foi publicado antes da sua confirmação.

## Evidência da auditoria

A leitura do servidor em 09/10 confirmou `demucs-worker:latest`, comando Python,
com `/opt/demucs-worker/worker.py` montado em `/app/worker.py` e volume de dados
em `/data`. A base desse arquivo foi incorporada ao repositório antes do patch.
SHA-256 da base: `4c3e525ca77475331963125480c3fa3305e52b4db8774b940dbb6b2eeb875821`.

A variante GPU já versionada em `worker-gpu/worker.py` tem capacidades adicionais
(MPS/auto e importação de áudios complementares). Nela foram portados somente
`claim`, `process` e o import de UUID. Não substituir o arquivo GPU pelo arquivo
CPU, nem alterar `DEVICE` ou as demais opções privadas.

O fluxo ativo é pull: `separate-stems` → `stem_jobs` → `claim_stem_job` →
worker → Storage/tabelas. O `demucs-worker/app.py` versionado anteriormente é
um worker push legado e gera IDs diferentes dos UUIDs da fila. Não há mapping
confiável que permita finalizar essa fila pelo callback antigo.

Não foram lidos `.env`, logs, músicas, identidades ou conteúdos de usuários.
Foram lidos código, mounts, schema, definições de funções e políticas.

Os dois Edge handlers remotos coincidiam com a base local. O callback usa CRLF:
SHA cru `bd97b469e98d9ed0a5a8c7fcf4cde81308b36e65caef566a579ad64980c4d0d4`;
normalizado para LF `ee671956e7b1bfc483adb8544a7e60b693dc708bba51c8e8702fbdd2ff64c5c1`.
A diferença entre esses hashes não representa alteração remota. A fila não tinha
revisão nem solicitante. `separate-stems` autorizava qualquer membro por
existência, sem `member_can`/consentimento. Tanto o callback quanto o worker
pull substituíam dados pelo ID da música, sem conferir a revisão/job atual.
O worker apagava as linhas anteriores antes de concluir cópias/uploads.

Cinco reproduções isoladas dos handlers antigos confirmaram: viewer sem
consentimento enfileirando; fonte diferente aceita pelo prefixo; callback antigo
substituindo faixas novas; erro antigo afetando job novo; e perda das linhas
anteriores quando o download respondia 401. O worker ativo mostrou os mesmos
padrões de escrita por inspeção; nenhum job real foi executado.

## Correção

- `enqueue_stem_job` usa a identidade autenticada, `member_can` atual (inclui
  consentimento e permissões individuais), moderação e igualdade da fonte.
  Bloqueia a linha da música, registra revisão/ator e atualiza fila/estado em uma
  transação. Pedidos repetidos do mesmo ator e revisão reutilizam o job ativo.
- `claim_stem_job_v2` e `stem_job_context` conferem identidade da fonte, vínculo
  com a música, revisão, autorização e worker. A finalização repete as condições.
- `finish_stem_job` troca as linhas das faixas automáticas e o estado numa única
  transação, depois de preparar todos os arquivos. Mantém faixas manuais.
  Falha de insert também reverte o delete. Erro/download/upload não remove as
  faixas válidas anteriores. Jobs terminais não são reaplicados.
- As saídas usam `equipe/música/stems/job/execução/faixa.mp3`. Uma execução velha
  não sobrescreve objetos de outra execução. O worker não escreve diretamente
  nas tabelas de músicas/faixas; usa o RPC restrito a `service_role`.
- Mudança persistida de `audio_path`/`audio_revision` limpa o job atual, além da
  invalidação das faixas já prevista no cadastro. Jobs antigos são descartados.
- O callback push é retirado: 401 sem autenticação, 503 se não configurado, 410
  se autenticado. Não baixa, grava ou remove nada. Isso não afeta o fluxo pull.
- O claim antigo retorna vazio. Jobs antigos sem ator/revisão, ainda pendentes,
  são marcados cancelados após drenagem; o estado da música solicita uma nova
  separação, preservando as faixas existentes.

Upload e corte web agora usam fontes novas em `recordings/<uuid>.<ext>`, com
`upsert:false`. O corte usa CAS pelo caminho que foi aberto. Falha no commit
preserva o áudio anterior; o preview só muda após confirmação do vínculo.
Remoção desvincula no banco antes de confirmar, sem apagar um objeto que pode
estar sendo lido. Limpeza física posterior permanece pendente.

Não altera plano, assinatura, consentimento, funções do Asafe ou gestão no app.
Não altera o SongEditor congelado nem o conteúdo do archive iOS 11. O trecho de importação YouTube do worker pull foi preservado sem mudanças.
A migração não adota jobs antigos atribuindo um solicitante fictício.

## Validação isolada

```sh
node supabase/tests/stems/fencing.test.mjs
python3 -m unittest discover -s demucs-worker -p test_worker.py -q
STEMS_TEST_WORKER_PATH=worker-gpu/worker.py python3 -m unittest discover -s demucs-worker -p test_worker.py -q
python3 -m unittest discover -s worker-gpu -p test_additional_audio.py -q
npx vitest run src/lib/recordingStorage.test.ts src/components/SongRegistrationUploads.test.tsx
npx --yes deno test --no-check --allow-read --import-map=supabase/tests/stems/import-map.json supabase/tests/stems/handlers.test.ts
npx --yes deno check --import-map=supabase/tests/stems/import-map.json supabase/functions/separate-stems/index.ts supabase/functions/stems-callback/index.ts
python3 -m py_compile demucs-worker/worker.py demucs-worker/test_worker.py
```

Resultados: 56 verificações SQL, 9 testes de fencing em cada worker (18),
7 regressões GPU de áudio adicional, 6 testes Deno e 19 testes web aprovados;
typecheck Edge e compilação sintática Python aprovados.

O SQL usa a migração e o `member_can` real, em PGlite com papéis e privilégios
padrão permissivos para verificar as revogações. Python executa `process` e
`claim` reais, com rede/modelo/áudio simulados. Deno importa os handlers reais,
sem permissão de rede e sem autenticação real. Não substitui execução Demucs
com áudio fictício no worker atualizado, nem teste de concorrência em PostgreSQL
com conexões independentes.

## Preflight somente leitura

`python3 scripts/lojas/preflight-stems.py --output /private/tmp/maislouvor-stems-preflight-20261009.json`
registra hashes crus, hashes de schema/RPC e contagens, sem nomes de usuários,
arquivos de configuração, logs ou conteúdo de músicas. Não autoriza nem aplica
mudanças. Em 09/10 às 20:11:54Z: **0 queued, 0 processing**, 1 worker CPU conhecido
(ativo nos últimos 5 minutos), 2 GPU conhecidos (1 ativo). Isso é um snapshot,
não prova que a fila permanecerá vazia durante o deploy.

O worker GPU local ativo foi localizado em
`/Users/filipecardone/LouvorMais/louvor-glass-flow/worker-gpu/worker.py`, iniciado
pelo LaunchAgent `com.maislouvor.worker` via `run-worker.sh`, com o mesmo cwd.
Seu SHA-256 é `50e8e15c26a485c23572d5955dda8f78008f8af2cadb5435f4f22e98d1915f65`,
idêntico ao arquivo GPU no commit `94b9a93` antes do patch; nenhuma função extra
ou alteração local foi encontrada. Foram lidos somente os campos de programa/cwd
do plist, sem variáveis de ambiente. O segundo heartbeat GPU conhecido não prova
outro worker online: apenas um estava recente. O serviço local não foi reiniciado.

## Implantação coordenada obrigatória

1. Conferir baseline hashes/schema, inventariar CPU **e todos os workers GPU**
   que usam a mesma fila. Bloquear novos pedidos por breve janela controlada.
2. Drenar jobs em execução e parar todos os workers antigos. A chave
   `service_role` permite que um processo antigo já em execução grave diretamente;
   trocar apenas o callback não o impede. A migração bloqueia músicas/fila na
   ordem definida e aborta se qualquer job estiver `processing` sob o lock.
   O claim legado retorna vazio depois da atualização. Um trigger também exige
   o marcador transacional do claim v2 na transição para `processing`; isso
   bloqueia uma chamada antiga que tenha começado antes do replacement e só
   retome depois do lock. Um worker antigo ocioso que retornar não recebe novos
   jobs pelo protocolo conhecido. Isso não limita uma chave administrativa
   comprometida, nem prova o código instalado nos dois hosts GPU: seus binários
   ainda precisam ser conferidos. Se não for possível confirmar a drenagem,
   **não aplicar a migração ainda**.
3. Fazer backup restaurável do banco e cópias privadas dos dois handlers e do
   worker, registrando hashes sem imprimir secrets. Usar lock de deploy.
4. Aplicar `20261010010000_stem_job_fencing.sql` com `ON_ERROR_STOP`, transação
   única, registrar versão de migração e recarregar cache PostgREST. Não existe
   escrita de consentimento nem mudança de concessões de planos nessa migração.
5. Instalar os dois handlers e `demucs-worker/worker.py` no mount já existente;
   atualizar cada GPU usando `worker-gpu/worker.py`, preservando sua configuração
   privada. A GPU não atualizada fica sem novos jobs de stems; CPU v2 assume
   temporariamente. Não anunciar aceleração GPU validada antes do teste remoto.
   Reiniciar somente os componentes necessários e liberar novos pedidos.
6. Conferir health, privilégios, protocolo v2 e separar um áudio fictício
   autorizado. Validar playback de faixas e mudança de fonte durante um job de
   teste. Conferir que nenhum worker antigo continuou a executar.

Em falha operacional, pausar a fila e restaurar os arquivos privados de forma
coordenada. Não restaurar dump cegamente nem reativar automaticamente o protocolo
antigo: ele reintroduz a vulnerabilidade. As faixas existentes não são apagadas
pela migração, e as novas colunas são aditivas; priorizar correção em frente.

## Limites explícitos

- Arquivos preparados que ficaram órfãos por falha, rejeição ou timeout podem
  permanecer no Storage. Não são apagados automaticamente: um timeout de commit
  pode significar sucesso no servidor. A limpeza futura deve conferir referências,
  estado do job e margem de tempo; não usar deleção cega por prefixo/mtime.
- O worker pode cair depois do claim. Não introduz recuperação automática de
  jobs `processing`, para não iniciar dois escritores da mesma execução. O
  operador pode reconciliar um job parado e solicitar nova separação.
- Autorização/consentimento são avaliados na instrução SQL. Uma revogação
  concorrente posterior ao snapshot da instrução não cancela retroativamente
  essa operação; a próxima instrução observa o novo estado.
- Upload/corte web preparados neste patch corrigem a sobrescrita da fonte.
  Clientes web antigos ou outros produtores que ainda sobrescrevam objetos sem
  mudar path/revisão não ganham detecção de conteúdo retroativamente. Publicar o
  web atualizado faz parte do rollout. Os fluxos de importação legados não foram
  reescritos por esta correção.
- A integridade do conteúdo produzido depende do worker confiável e da chave
  `service_role`. O patch não transforma uma chave administrativa comprometida
  em um principal limitado.


## Resultado da implantação e QA

O runner desta execução está em `/private/tmp/maislouvor-stems-rollout.py`, com
cópia da parte remota e payload em
`/Volumes/MaisLouvorBuild/Stems-Release-20261009`. O lock de deploy foi mantido
na janela. Todas as três filas estavam zeradas antes e depois da pausa.
Nenhum job ativo foi interrompido. O claim de stems legado foi retirado; os
claims de YouTube/áudios adicionais foram pausados apenas durante a manutenção
e restaurados com as mesmas definições e ACLs.

Backup remoto privado:
`/var/lib/maislouvor-deploy/20261009-stems-fencing/database.before.dump`,
1.502.929 bytes, SHA-256
`83f2dc80fc9534098bb7c92bb36588b5794a2b9de41b8513b6c4c8e3014d2109`.
`pg_restore --list` passou. O diretório também contém os originais dos arquivos,
definições/ACLs dos claims, payload, estado e resultado. Nenhum dump foi restaurado.
A cópia local do worker GPU e do plist foi comparada antes da troca.

Migração `20261010010000` registrada. O claim antigo retorna vazio; anon e
usuários autenticados não podem finalizar jobs, enquanto o worker pode.
CPU VPS e GPU local foram atualizados com suas respectivas variantes;
67 outros arquivos de funções, imagem/ambiente/mounts dos containers e o plist
local permaneceram iguais. Ambos os tipos de worker voltaram a enviar heartbeat
nos últimos 60 segundos. Edge está `healthy`; checagens sem usuário retornaram
401 em `separate-stems`, 401 em `stems-callback` e 404 esperado no GET do Asafe.

O smoke ocorreu entre **17:25:07 e 17:25:30 BRT**. Foi criada uma única identidade
temporária, marcada como fixture, com consentimento `review_fixture`, equipe
exclusiva, Asafe desativado, sem convites/e-mails/avisos. O handler autenticado
recebeu um WAV gerado localmente (oito segundos, nenhum fonograma de terceiros).
O worker GPU processou o job em **11 segundos** e produziu **seis faixas**.
As seis foram baixadas com a sessão do usuário fictício (321.828 bytes cada),
e a revisão, o job e o estado final da música foram conferidos. Foram encontradas
zero notificações e apenas o contrato gratuito/manual dessa fixture. A escuta e
a qualidade musical do isolamento não foram avaliadas por esse sinal sintético.

Depois do heartbeat que confirmou o término do worker, foram removidos apenas
os 13 arquivos da fixture (fonte, seis saídas e seis caches), metadados de cache,
equipe, usuário e consentimento fictício. Conferidas ausência de equipe/música
e ausência dos objetos nos dois prefixes exclusivos. A credencial temporária
foi apagada após cleanup confirmado. A demo Apple não foi usada nem alterada.
Relatório sem identidades em
`/Volumes/MaisLouvorBuild/Stems-Release-20261009/qa-result.json`.

A segunda GPU conhecida não foi alterada remotamente. Uma versão antiga que
voltar usando o claim legado fica sem novos jobs de stems até atualização;
a CPU e a GPU local atualizadas mantêm o processamento disponível.
