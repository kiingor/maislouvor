# Áudios adicionais por música

Integração local sobre a `main` no commit `2fb6d64` (sequência de loops). A implementação de `4afe38c`, da branch `feat/audios-adicionais`, foi adaptada à interface e às permissões desta base. Não foi incorporada a árvore inteira de `release/loops-20260921`, que usa outro esquema de banco. A correção local do avanço indevido aos 1:09 e seus cinco testes também estão incluídos.

## Uso

- No editor, **Áudios adicionais** recebe arquivos de até 50 MB ou importações do YouTube. Cada item tem nome, reprodução, renomeação e remoção com confirmação.
- Leitores da música acessam os materiais no resumo e pelo botão de fones no ensaio. Somente editores da equipe proprietária podem modificá-los.
- A fila fica persistida e é consultada a cada quatro segundos enquanto aguarda ou processa. Falhas permitem tentar novamente no mesmo item.
- Abrir os adicionais pausa o áudio principal, as faixas e a rolagem. Posição, velocidade, ordem dos loops e repetição atual são preservadas. Fechar o diálogo interrompe o adicional; o usuário retoma a música quando desejar. Atalhos de fundo ficam suspensos durante o diálogo.

## Persistência e processamento

`song_audio_attachments` guarda nome, arquivo, URL e estado da importação. Cada arquivo usa `<equipe>/<música>/additional/<id>.<extensão>`. As alterações são salvas imediatamente, sem depender de “Salvar” no formulário da música.

O fluxo não escreve em `songs.audio_path`, `media_url`, `segment_timestamps`, `song_tracks` ou `song_loop_points`. A função `import-song-audio` autentica o usuário, verifica a leitura da música e a RPC `can_edit_song_audio`, valida o vídeo e enfileira o adicional. Essa RPC usa `member_can` quando existe, respeitando permissões específicas; somente na base legada usa `can_edit_team`. A mesma regra determina os controles de edição na interface e as políticas de escrita da tabela. A fila é separada de `yt_import_jobs`, impedindo que um worker antigo trate o adicional como áudio principal.

O worker consulta `claim_song_audio_import`, reutiliza o cache do YouTube quando disponível e conclui pela função `complete_song_audio_import`. Se o adicional foi removido durante o processamento, o novo arquivo é descartado. A capa principal é preservada. Importações interrompidas por mais de quinze minutos são marcadas com erro na próxima consulta do worker.

A leitura acompanha as políticas da música. Os arquivos ficam no bucket privado `audio`, com URLs assinadas. Permissões de coluna impedem clientes autenticados de alterar status e destinos da fila; o banco valida o caminho exclusivo de cada adicional.

## Validação da integração

- Vitest: **89 testes aprovados**, incluindo sequência de loops, pausa/retomada dos adicionais na segunda repetição e em velocidade reduzida, correção aos 1:09, upload, importação, permissões e limpeza do player.
- Python: **7 testes aprovados** do worker, sem rede, cobrindo cache, download, erros, remoção concorrente e preservação do fluxo principal.
- PostgreSQL/PGlite: **61 verificações aprovadas** (28 no modelo legado e 33 no modelo de permissões granulares, incluindo concessões e bloqueios explícitos), usando a migration real em memória: permissões de editor/leitor/equipe externa/compartilhamento, caminhos, fila, expiração e preservação da música principal.
- TypeScript e build Vite/PWA aprovados. Arquivos novos sem erros de ESLint; os arquivos legados editados mantêm os mesmos 41 diagnósticos anteriores.
- Chromium com componentes reais, dados sintéticos e backend simulado em **320, 390 e 1280 px**: layout sem overflow, upload isolado, player no resumo, fechamento do áudio e acesso ao último de 40 loops.
- Reprodução nativa no navegador: o áudio principal toca, pausa para os adicionais, preserva fonte/posição/loop, bloqueia os atalhos de fundo e retoma ao fechar. Capturas e scripts em `/tmp/maislouvor-merge-20260926`.

```sh
npm test
./node_modules/.bin/tsc --noEmit -p tsconfig.app.json
npm run build
python3 -m unittest discover -s worker-gpu -p 'test_*.py' -v
```

O teste SQL usa um banco isolado em memória, sem credenciais externas:

```sh
PGLITE_MODULE=/caminho/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/song_audio_attachments.mjs
PERMISSION_MODEL=granular PGLITE_MODULE=/caminho/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/song_audio_attachments.mjs
```

## Ativação do backend pendente

O Vite de `localhost:8080` usa o Supabase online definido no ambiente; não é um banco local. Uma consulta de leitura em 26/09/2026 confirmou que `song_audio_attachments` e `import-song-audio` ainda não existem nesse backend. O frontend mostra a indisponibilidade e desabilita novos uploads enquanto a estrutura está ausente, preservando o restante do ensaio.

Para testar upload e YouTube de ponta a ponta nesse ambiente:

1. Aplicar somente `20260926120000_song_audio_attachments.sql` em uma transação, na base confirmada para a ativação; a autorização se adapta ao modelo existente. Não executar migrations antigas indiscriminadamente.
2. Publicar `import-song-audio` com verificação JWT.
3. Atualizar o worker que importa YouTube com `worker-gpu/worker.py`, preservando sua configuração privada e `YT_ENABLED=1`; ele precisa apontar para o mesmo backend do frontend.
4. Validar com uma música de teste: upload/importação reais, acesso de outro membro e retomada do ensaio.

Não foram feitos push, publicação, alterações no banco online ou no worker em execução. A migration, função e interface agora atendem tanto ao modelo legado quanto ao modelo de permissões granulares, sem ignorar bloqueios específicos de edição.

### Divergência de ambiente confirmada em 26/09/2026

A autorização para ativação foi recebida. Entretanto, o localhost usa o projeto Supabase Cloud `hhqzapwtuyzchismcuie`, que não está entre os projetos acessíveis à conta autenticada no CLI e no painel. O worker ativo, gerenciado pelo LaunchAgent `com.maislouvor.worker`, usa `https://api.maislouvor.com`, na VPS acessível por `louvor-vps`. Essa produção possui `member_can` e não contém o repertório `7e6bcb37-9a56-420f-9160-473196ffada8` do link solicitado.

Foi pedida uma definição de destino: manter a base antiga com acesso administrativo, ou usar a produção e alinhar a configuração local. Até essa definição, os dois backends e o worker permanecem sem alterações. As consultas à VPS foram de leitura; as novas verificações SQL rodaram apenas no PGlite isolado.
