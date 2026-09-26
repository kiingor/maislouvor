# Áudios adicionais por música

Versão integrada à base exata da produção `31a752d` (correção do avanço no ensaio e página do APK 1.0.2). Inclui os áudios adicionais de `4afe38c`, a sequência de loops de `2fb6d64` e autorização compatível com os modelos legado e granular. A integração antiga permanece na `main` local; esta release preserva a interface, o mixer e as correções mais recentes da produção.

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

## Validação da release de produção

- Vitest: **122 testes aprovados em 14 arquivos**. Inclui upload, importação, permissões, sequência de loops, pausa/retomada na segunda repetição com velocidade reduzida e faixas carregadas, passagem entre loops no fim do arquivo e os cinco testes da correção do avanço aos 1:09.
- Worker: **7 testes Python aprovados**, sem rede, cobrindo cache, download, erros, remoção concorrente e preservação do fluxo principal.
- PostgreSQL/PGlite: **61 verificações** nos modelos legado (28) e granular (33). A release atual repetiu as 33 verificações granulares. A migration também passou em uma transação revertida no PostgreSQL de produção antes da aplicação definitiva.
- Build Vite/PWA e ESLint dos arquivos novos aprovados. O TypeScript mantém os **14 diagnósticos preexistentes** da base `31a752d`, nos mesmos arquivos/linhas/códigos; não foi apresentado como um typecheck sem erros.
- Backend real: upload por usuário autenticado, renomeação, reprodução por leitor, bloqueio de escrita do leitor, rejeição de URL inválida, autenticação e importação YouTube processada pelo worker ativo. Música principal, faixas, loops e repertório permaneceram idênticos antes/depois. O teste YouTube usou um vídeo já no cache; o download sem cache está coberto pelo teste isolado do worker.
- Chrome com o **bundle final** e backend real em **320, 390 e 1280 px**: editor, formulário YouTube, importação concluída, reprodução nativa do adicional, pausa/retomada do ensaio na mesma posição, seleção/ordem dos loops e velocidade 0,75x preservadas. Sem overflow horizontal. Fechar o diálogo removeu o player adicional.
- O seletor de arquivos do Chrome bloqueou a automação por ausência da permissão da extensão para URLs de arquivo. O upload real foi validado pela API autenticada; o componente e a seleção de arquivo têm testes automatizados.

```sh
npm test
npm run build
python3 -m unittest discover -s worker-gpu -p 'test_*.py' -v
PERMISSION_MODEL=granular PGLITE_MODULE=/caminho/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/song_audio_attachments.mjs
```

## Produção e publicação

Destino autorizado: **https://maislouvor.com**, usando **https://api.maislouvor.com**. A publicação web usa a base `31a752d`, preserva o APK 1.0.2 e os assets antigos e troca os arquivos de entrada atomicamente, com o service worker por último. O script recusa substituir uma versão que mudou desde a preparação e guarda backup completo do site e fonte sem credenciais. Evidências e hashes da publicação ficam no registro independente do BrainHub e em `release.json` no backup privado da VPS.

Backend aplicado em 26/09/2026:

1. `20260926120000_song_audio_attachments.sql` aplicada em transação, após backup do schema e verificação dos dados existentes. O cache PostgREST foi atualizado.
2. `import-song-audio` publicada no runtime Edge, com autenticação JWT, sem substituir as funções antigas.
3. Worker do LaunchAgent `com.maislouvor.worker` atualizado somente em `worker.py`, preservando configuração, cookies e ambiente Python. Reinício após confirmar filas vazias; processamento da nova fila verificado.
4. Contas, equipe, música, loops, repertório e arquivos temporários usados no teste são removidos após a verificação.

Backups desta ativação:

- Banco/função: `/var/backups/maislouvor/20260926-additional-audio-backend` (schema anterior e SQL aplicado; a função é nova).
- Worker: `~/.local/share/maislouvor/worker-backups/20260926-additional-audio/worker.py`.
- Site: `/var/backups/maislouvor/20260926-additional-audio`, criado pelo script no momento da troca.

O localhost `:8080` continua apontando ao projeto legado Supabase Cloud `hhqzapwtuyzchismcuie`, que não está acessível à conta administrativa atual. O repertório `7e6bcb37-9a56-420f-9160-473196ffada8` desse ambiente não existe na produção; o teste no site deve usar os repertórios da própria produção. Não houve cópia de músicas entre as bases.
