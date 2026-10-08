# Remoção da IA de repertório e da importação do Moises — 07/10/2026

> **Correção posterior do escopo:** o usuário esclareceu que a retirada é somente de sugestões de músicas por IA e Moises. `import-cifra`, `sync-lyrics` e `transpose` foram restauradas no código e no servidor. Asafe e separação local de faixas nunca foram removidos. O registro abaixo descreve a etapa inicial, agora parcialmente revertida. [Estado atual e validação](preservacao-asafe-faixas-20261007.md).

Filipe pediu retirar a sugestão de músicas por IA e a importação do Moises, que não estava funcionando. Mudanças no checkout `MaisLouvor-lojas`, branch `feat/conformidade-lojas`. Nenhuma alteração no checkout de assinaturas.

## Interface e código

- `AddCultoSongModal`: retirados o botão IA, formulário de tema/quantidade, geração de sugestões e seleção em lote. Permanecem busca por título/artista, inclusão manual e repetição na sequência. A consulta da lista não carrega mais letras, usadas somente na sugestão.
- `SongEditor`: retirados botão, modal, estados e importador do Moises. Retirada a denúncia genérica de resposta de IA nessa tela; denúncia de música e origem/direitos permanecem. Cifras/letras manuais, transposição local e faixas permanecem.
- Removidos `useAiRequest`, seus três testes, `ai-disclosure` e a validação compartilhada do consentimento dessa integração, agora sem consumidores. O consentimento do Asafe é independente e permanece.
- As implementações de `suggest-culto-songs`, `import-moises`, `import-cifra`, `sync-lyrics` e `transpose` foram substituídas por respostas HTTP 410. As últimas três já não possuíam chamadores no frontend e mantinham o mesmo gateway antigo. O handler compartilhado não lê o corpo, não registra conteúdo e não consulta provedores nem o banco. `ai-disclosure` nunca havia sido publicado.
- Termos, privacidade e notas de revisão ajustados para os recursos restantes. Mantida a versão de rascunho dos documentos de 07/10, ainda não publicada. Nenhum dado jurídico foi presumido. O operador do gateway musical deixou de ser uma pendência; o Asafe continua com sua configuração e consentimento próprios.

## Aplicado ao servidor

`scripts/lojas/retire-music-ai.py --apply` conferiu hashes contra a produção, usou o lock de implantação e salvou as fontes anteriores em diretório privado. Reiniciou somente `supabase-edge-functions`, preservando a imagem e todas as variáveis. Todos os arquivos das demais funções tiveram hashes preservados, incluindo Asafe, Apple, exclusão, moderação e separação de faixas.

A tentativa inicial foi revertida automaticamente porque o teste esperava OPTIONS 204, mas o Kong responde 200 ao preflight antes do handler. Confirmado esse comportamento, o teste passou a aceitar ambos os códigos de preflight. A segunda implantação foi concluída e validada. Backups e manifestos privados preservados em `/var/lib/maislouvor-deploy/20261007-retire-music-ai/` e `/var/lib/maislouvor-deploy/20261007-retire-music-ai-r2/`; o resultado efetivo está no segundo diretório. Não repetir o instalador sobre essa instalação existente.

Para cada uma das cinco rotas, POST com JSON, POST inválido e GET retornaram **410 / FEATURE_REMOVED**, com CORS. OPTIONS retornou 200 pelo gateway. Apple/exclusão/separação continuaram recusando chamadas sem usuário válido (401); endpoints públicos de culto/repertório continuaram recusando parâmetros ausentes (400). Container saudável. Nenhuma migração, mudança de credencial, exclusão de conteúdo, mensagem ou convite foi executado.

## Validação local

- TypeScript aprovado; **368 testes Vitest em 43 arquivos** aprovados. A redução de três testes corresponde ao hook removido.
- Cinco entrypoints aprovados pelo `deno check`. Dois testes temporários Deno, sem permissões de rede/ambiente, confirmaram a resposta de retirada e que o corpo recebido não é lido, inclusive quando não é JSON.
- Playwright em 440×956 e 1024×1366: busca por artista, inclusão e repetição com ordem correta, busca sem resultados; edição de cifra e letra, transposição local e ausência dos dois botões removidos. Sem chamadas de funções externas, erros JavaScript ou transbordamento horizontal; screenshots conferidos. Dados inteiramente simulados.
- Build de QA com `VITE_STORE_BUILD=1` aprovado. Bundle sem as rotas/textos removidos, mantendo Asafe, cifra e separação. Esse build ficou em `tmp/remove-music-ai/dist` e não foi publicado.
- `git diff --check` e sintaxe do instalador aprovados. Evidências locais em `tmp/remove-music-ai/`.

## Distribuição

**Não houve novo TestFlight, deploy do frontend, commit, push ou merge.** O último build confirmado segue **1.0.0 (6)**. Ele ainda pode mostrar os botões antigos, mas as rotas já não executam esses recursos. A retirada visual chegará com o próximo pacote.

O guard de release continua apontando dez valores jurídicos pendentes em `src/lib/legal.ts`. SMTP permanece adiado por Filipe; assinaturas seguem na outra sessão. As migrações de termos e consentimento estrito do Asafe continuam aguardando publicação conjunta com a interface/documentos. Não reutilizar o gerador histórico `ios-internal-testflight.mjs`, que usa um snapshot anterior sem as correções completas, para o próximo beta completo.
