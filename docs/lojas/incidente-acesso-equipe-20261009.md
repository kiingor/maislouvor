# Incidente de acesso de clientes antigos — 2026-10-09

## Diagnóstico confirmado

A migração `20261008233000_team_data_consent.sql` passou a exigir consentimento
individual vigente nas políticas de leitura/alteração da equipe. Clientes antigos
(APK Android e web em cache) ainda não exibiam essa etapa. A resposta vazia de
`team_members` era apresentada como ausência de equipe; `TeamSettings` também
dependia dessa consulta para mostrar o próprio nome, embora o perfil ainda pudesse
ser lido diretamente. Nas escalas, os joins de membros sem consentimento ficavam
nulos.

Consultas de produção somente de leitura confirmaram, na equipe reportada:
17 vínculos existentes, 3 pessoas com consentimento vigente e 14 sem ele. Os 30
perfis da plataforma tinham nome preenchido. Nenhuma conta ou participação foi
apagada. Os totais foram novamente conferidos após a publicação, sem alteração;
4 consentimentos reais ativos e nenhum revogado em toda a plataforma.

## Correção publicada

- Commit de aplicação: `69872bc4f0aeeac66d01ebd51da17964dee2b302`.
- Release: `20261009-web-recuperar-acesso`, publicada em
  `2026-10-09T18:08:44Z` (15:08 em Fortaleza).
- Entrada pública: <https://maislouvor.com/baixar/recuperar-acesso>.
- A rota fica fora do fallback do service worker antigo, carregando o shell
  atual mesmo quando `/app` ainda abrir pelo cache anterior.
- O login retorna à recuperação; a pessoa confere a conta usada, faz sua própria
  escolha e só recebe confirmação após a leitura autenticada do próprio vínculo.
- A ausência de equipe ou um erro não oferece recriar conta/equipe. Há retentativa
  e suporte. Não há consentimento automático nem acesso de equipe antes do aceite.
- `TeamSettings` lê o perfil pelo `user_id` autenticado, independentemente da
  equipe, e mostra erro/retentativa em falhas, evitando a indicação enganosa
  “Sem nome”. Edições invalidam também essa consulta.

Não houve alteração de banco, políticas, consentimentos, Asafe ou APKs neste
hotfix. A correção do perfil está na web publicada; o APK já instalado recupera
os dados anteriores após o consentimento individual na web e sua reabertura.

## Validação realizada

- 541 testes Vitest em 62 arquivos passaram; typecheck e `git diff --check` passaram.
- 10 testes do publicador passaram, incluindo reversão automática e preservação
  de arquivos. Build web e verificação de placeholders concluídos.
- Publicador verificou 224 arquivos, 141 assets HTTPS e 7 rotas. Landing,
  APKs e assets anteriores preservados.
- Chromium isolado em 390 × 844: página publicada sem overflow horizontal,
  login por senha da conta fictícia de revisão retornou à rota e confirmou a
  equipe real dessa fixture. Nenhum aceite foi realizado; seu consentimento
  fictício já existia. Zero erros JavaScript.
- Reproduzido com o service worker anterior controlando a página e shell antigo
  `index-5PAlF4oM.js` em cache: o link de recuperação carregou
  `index-3HfXGHxi.js` e a tela nova mantendo o worker antigo no controle.
- Evidências do publicador em `tmp/web-releases/20261009-web-recuperar-acesso/`;
  cópia/backup remoto em `/var/lib/maislouvor-deploy/20261009-web-recuperar-acesso/`.

## Ação pendente dos integrantes

Abrir a URL de recuperação no navegador, entrar com a mesma conta/formato de login,
revisar a escolha individual e, caso autorize, aguardar a confirmação de acesso.
Depois fechar e reabrir o Android, ou usar o botão de acesso pelo navegador.
Não excluir contas, recriar nomes/equipes ou repetir convites.

Não foi confirmado que os 14 integrantes afetados concluíram esse fluxo. Os nomes
continuam ocultos para a equipe enquanto cada pessoa não autorizar. Não gravar
aceites em nome dos usuários nem flexibilizar `private.team_data_allowed`: isso
também alteraria proteções do Asafe. Ausência de registro não prova ausência de
recusa, pois o link “Continuar sem autorizar” não grava uma linha histórica.

Para futuras mudanças com bloqueio no servidor, verificar primeiro a compatibilidade
dos clientes distribuídos, publicar uma rota acessível a clientes antigos e só
então ativar a exigência com um caminho de transição testado.
