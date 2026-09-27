# Observações nos loops + correção do TAP publicadas — 27/09/2026

Autorização do usuário (via WhatsApp): «Quando terminar lá pode pedir pra publicar». Escopo: somente o site `https://maislouvor.com`, com a migração aditiva antes. Sem APK e sem lojas.

## Fonte
- Branch `redesign/ios27`, commit **`d67d6bd83364e041bfb91936d88c0ce5c7970ad4`**. Inclui `9802e26` (observações e correção do TAP) e o ajuste do texto de visibilidade.
- Base anterior em produção: `e145cb8` (redesign iOS 27).
- Sem push para o GitHub.

## Gates antes de publicar
Vitest 135/135 · PGlite 14/14 · E2E no Chrome com backend simulado: 189/189 no servidor de desenvolvimento e 189/189 no **bundle final** (vite preview) · typecheck com os 9 erros pré-existentes · ESLint sem problemas novos · build ok.

## 1. Backend (antes do frontend)
- Estado antes, por HTTPS: `select=notes` respondia `400 column song_loop_points.notes does not exist`. Havia 60 loops (39 públicos, 6 perfis).
- Backup em `/var/backups/maislouvor/20260927-loop-notes-backend`: `schema-before.sql` (schema `public`), `song_loop_points-data-before.sql`, `applied-migration.sql` (sha256 `50e6c2f2…`), impressões digitais antes e depois, `applied-at.txt`.
- Ensaio em transação revertida (coluna, CHECK, 60/60 nulos, espaço em branco recusado), seguido da aplicação em `--single-transaction` com `lock_timeout` de 5 s às **2026-09-27T14:22:26Z**. Depois, `NOTIFY pgrst, 'reload schema'`.
- Resultado: a impressão digital dos 60 loops ficou idêntica (`bc83fa81…`); as 6 políticas RLS estão inalteradas; a API responde `200` para `select=notes`.

## 2. Frontend
- Release em `/var/www/maislouvor-releases/20260927-loop-notes-tap` (171 arquivos, `SHA256SUMS` conferido no servidor).
- `publish.sh` é o mesmo do release anterior. Mudaram só os IDs e os hashes esperados, e foi acrescentada a checagem que preserva o APK 1.0.3.
- Execução: lock, backup completo, troca atômica com o service worker por último e rollback automático, que não foi acionado.
- Backup do site anterior: `/var/backups/maislouvor/20260927-loop-notes-tap/site`, com `release.json`, fonte sem credenciais e o script.
- Index `3c65f7ac…` → **`79208a6300a922731ce6f5b98e67fc00be84efa42737bef312acd4e705e47847`**; service worker `a98923f6…` → **`3b44001d2538f50a62f9ebc01ce108cfda9c99da845da9f3183ea300a03f63d5`**.

## Verificação pós-publicação
- HTTPS: 171/171 arquivos iguais ao `SHA256SUMS`. `/login`, `/app/home`, `/app/cultos`, `/baixar` e `/app/repertorios/*/present` servem o novo index. APKs `LouvorMais.apk` e 1.0.2 (`b951bc08…`) e 1.0.3 (`9c30375f…`) preservados.
- Smoke no site publicado, no Chrome, com a API simulada dentro do navegador (sem escrever na produção): **184/184**.
  - Observações: 88 checagens em 402×874 e 1366×900, claro e escuro. Cobrem criar, editar, persistir após recarregar, remover sem espaço reservado, 1 linha com expandir/recolher, reprodução, sequência e 0.75x.
  - TAP e diálogos: 96 checagens em 402×874, 874×402, 1024×768 e 1366×900, sem tela de erro e sem erro no console.
- Backend real, em transação revertida no PostgreSQL de produção, com um dono e um colega reais:
  - o dono grava a observação via RLS, com a quebra de linha preservada;
  - 1001 caracteres é recusado;
  - o colega lê a observação do loop público e não consegue alterá-la.
  
  Depois do ROLLBACK: 0 observações e impressão digital igual à de antes.

## Limitações
- **APK 1.0.3 continua com o erro do TAP** (o bundle é local). A correção no Android exige um APK 1.0.4, que não foi gerado porque precisa de pedido próprio.
- Nenhuma observação real foi gravada nas contas; o fluxo de escrita via PostgREST com usuário real não foi exercitado de ponta a ponta. A API simulada cobre a interface, e o SQL com RLS cobre o banco.
- Quem está com o PWA aberto recebe a versão nova quando o service worker atualizar (ao reabrir).
- Sem teste em aparelho físico.

## Reversão
- **Site**: restaurar `index.html`, `sw.js`, `registerSW.js` e `manifest.webmanifest` de `/var/backups/maislouvor/20260927-loop-notes-tap/site/` (troca atômica, service worker por último). Os assets novos e antigos convivem.
- **Banco**: a coluna pode ficar, porque o frontend anterior a ignora. Removê-la (`DROP COLUMN notes`) apaga as observações gravadas; só com decisão explícita.
