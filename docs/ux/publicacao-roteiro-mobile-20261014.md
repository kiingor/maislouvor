# Roteiro mobile — publicação web de 14/10/2026

Proposta visual aprovada e publicação autorizada pelo usuário. A versão web foi publicada em **14/10/2026 às 22:14:02, America/Fortaleza** (`2026-10-15T01:14:02Z`).

## Alteração publicada

O roteiro de `src/pages/CultoDetail.tsx` apresenta a capa na margem esquerda, com número sobreposto no celular; nomes e naipes das vozes ocupam a largura inteira, organizados por grupo. Tags foram retiradas desta visualização, momentos ficaram mais compactos e o microfone repetido é ocultado quando o próprio bloco de vozes pode ser tocado. O acesso às músicas sem vozes definidas, o seletor de tom e as ações de edição continuam disponíveis. Observações aproveitam a mesma largura.

Fonte: `38f7d251d5b566cb0bdf0c2de93f73e568c7bdbc`, branch `codex/roteiro-mobile`. A produção anterior era `20261013-web-settings-ux-r2`, fonte `3dee9288cbba58363b44797c972a32e6f89a9ae3`. A comparação de todas as fontes/configurações de build entre a versão anterior e a nova confirmou apenas a mudança em `CultoDetail.tsx`.

## Preparação e validação

- `npm run typecheck`, build normal com trava legal e `git diff --check` passaram.
- Dez testes do pipeline `publish-integrated-web.py` passaram.
- Playwright/Chromium sobre o componente real e CSS compilado, com dados fictícios e backend simulado: larguras 320, 360, 390, 430 e 1024px, como visualizador e editor, sem overflow horizontal ou nomes cortados. Modal de vozes, canção sem atribuições, menu de movimentação e envio simulado de alteração de tom conferidos. Capturas inspecionadas em claro, escuro e desktop.
- Configuração de produção carregada somente no ambiente do processo de build, a partir da cópia integrada `MaisLouvor-lojas`; nenhum `.env` foi alterado ou incluído no pacote. URL/chave pública do Supabase e configuração pública de cobrança web foram comparadas com os bundles ativos antes da publicação, sem registrar valores.
- Pacote preparado no modo `web-production`; layout aprovado confirmado no chunk `assets/CultoDetail-D8Q0tzS6.js`. Login mobile conferido antes da troca, sem erro JavaScript ou overflow horizontal.
- Após a publicação, hashes de `index.html`, `sw.js`, CSS principal e chunk do culto conferidos novamente pelo domínio público. Chromium em 390px confirmou login sem overflow ou erro JavaScript e redirecionamento da rota protegida de cultos para login quando não há sessão. Não houve acesso autenticado nem escrita em conta real nesta conferência.

## Publicação e recuperação

Release: `20261014-web-roteiro-mobile`, com `published: true` no resultado local e remoto. Aplicação feita pelo pipeline existente, com lock, verificação da versão ativa, backup prévio, cópias atômicas e opção de reversão.

- 226 arquivos conferidos no servidor; 143 assets/shell e sete rotas conferidos por HTTPS.
- Marketing, Caddy, APKs, service worker da landing e assets anteriores preservados.
- `index.html`: `3efc19faa36c98934e2ae7d0967c02b69250aa861c383297029d3c9eb4580a02`.
- `sw.js`: `9317c34755fca5bebaed65a6bd5411d39bdeb2e7829b87a278288a5f872d0a87`.
- Pacote: `6f1d455258182e9f2ecf7acbcae4ff17097fb2cc257e6037414fa879ad6f01bb`.
- Evidências locais: `tmp/web-releases/20261014-web-roteiro-mobile/` (ignorado pelo Git).
- Backup e resultado remoto: `/var/lib/maislouvor-deploy/20261014-web-roteiro-mobile/`.

Reversão, somente enquanto essa publicação continuar ativa:

```sh
python3 scripts/lojas/publish-integrated-web.py rollback --release 20261014-web-roteiro-mobile
```

Nenhuma migração, alteração em dados reais ou novo binário Android/iOS foi necessário para esta publicação web. O aplicativo nativo usa bundle local e precisa de uma compilação própria para receber esta interface; a submissão Apple em análise não foi modificada. Clientes web com uma aba antiga podem precisar recarregar após a atualização do service worker.
