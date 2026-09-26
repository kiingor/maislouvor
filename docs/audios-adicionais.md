# Áudios adicionais por música

Implementação na branch `feat/audios-adicionais`, a partir de `release/loops-20260921` (`990c695`). A `main` local não contém a interface e a função de importação do YouTube usadas pela versão integrada. O trabalho está em `../MaisLouvor-audios-adicionais`; a árvore original foi preservada.

## Uso

- No editor, a seção **Áudios adicionais** permite adicionar arquivos (até 50 MB) ou importar o áudio de um vídeo do YouTube. Cada item tem nome próprio, reprodução, renomeação e remoção com confirmação.
- Os membros que podem ler a música encontram os materiais no resumo e pelo botão de fones no ensaio. Só editores da música podem modificá-los.
- O status da importação fica salvo e é consultado a cada quatro segundos enquanto aguarda ou processa. Falhas permitem tentar novamente no mesmo item.
- No ensaio, abrir os materiais pausa a reprodução principal e as faixas, conservando posição, velocidade e loop selecionado. Fechar o material para o áudio adicional; o usuário pode retomar a música. Atalhos do ensaio ficam suspensos enquanto esse diálogo está aberto.

## Persistência e processamento

`song_audio_attachments` guarda o nome, arquivo, URL original e estado da importação. O caminho é `<equipe>/<música>/additional/<id>.<extensão>`. Upload, renomeação e remoção são salvos imediatamente, sem depender de “Salvar” no formulário da música.

Não há escrita em `songs.audio_path`, `media_url`, `segment_timestamps`, `song_tracks` ou `song_loop_points` no fluxo dos adicionais. A função `import-song-audio` autentica o usuário, verifica a leitura da música e `member_can(..., 'musicas', 'editar')`, valida o vídeo e enfileira o adicional. A fila é a própria tabela de adicionais, separada de `yt_import_jobs`: um worker antigo nunca recebe esses itens.

O worker consulta `claim_song_audio_import`, reutiliza o cache do YouTube quando disponível ou usa o mesmo download existente. A conclusão é condicional: se o adicional foi removido durante o processamento, o arquivo novo é descartado. A capa principal também é preservada. Trabalhos interrompidos por mais de quinze minutos são marcados com erro quando o worker volta a consultar a fila.

A leitura segue as políticas da música, incluindo compartilhamentos explícitos já existentes. Arquivos continuam no bucket privado `audio`, com URLs assinadas. Permissões de coluna impedem clientes autenticados de alterar status ou destino da fila diretamente. O banco valida que cada arquivo pertence ao seu próprio adicional.

## Validação local

- Vitest: 98 testes (68 existentes, 30 novos), incluindo importação, validação de links, upload e compensação de falhas, remoção, reprodução exclusiva, permissões da interface e fechamento do player.
- Python: sete regressões do worker sem rede, cobrindo cache, download, erros, remoção durante processamento e preservação do fluxo principal.
- PostgreSQL via PGlite: 25 verificações com a migration real, permissões de editor/leitor/equipe externa/compartilhamento, caminhos, fila, expiração e integridade da música principal.
- Chromium: componentes reais com dados sintéticos e backend simulado, em 320, 390 e 1280 pixels. Sem overflow horizontal ou controles cortados; formulário, upload, importação do YouTube, reprodução no resumo e acesso ao último de 40 loops conferidos.
- Ensaio no navegador: áudio principal reproduziu, pausou ao abrir os adicionais, conservou exatamente fonte/posição/loop, bloqueou atalhos de fundo, trocou entre adicionais e retomou depois de fechar.
- Build Vite/PWA aprovado. ESLint dos arquivos novos e `git diff --check` aprovados; nenhuma ocorrência nova de lint nos arquivos legados editados.
- `typecheck` geral continua com os mesmos 14 diagnósticos da base `990c695`, fora desta alteração. Comparação feita em uma cópia limpa da base; nenhum diagnóstico novo.

Comandos de verificação:

```sh
npm test
npm run build
python3 -m unittest discover -s worker-gpu -p 'test_*.py' -v
python3 -m py_compile worker-gpu/worker.py
bash -n worker-gpu/run-worker.sh
```

O teste SQL usa um banco em memória e não recebe URL/credenciais de produção. Instale `@electric-sql/pglite` em uma pasta temporária e indique o módulo, ou disponibilize-o no ambiente Node:

```sh
PGLITE_MODULE=/caminho/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/song_audio_attachments.mjs
```

## Publicação pendente

Não foram feitas alterações no servidor, no banco real ou no worker em execução. A importação real de um vídeo externo não foi executada nesta sessão. As capturas e os scripts da verificação visual estão em `/tmp/maislouvor-additional-qa`.

Ordem de ativação:

1. Aplicar **somente** `20260926120000_song_audio_attachments.sql` em uma transação, sobre o esquema integrado que já possui `member_can`. Não executar migrations antigas indiscriminadamente na produção, cuja evolução é diferente da `main`.
2. Atualizar o worker que importa YouTube com `worker-gpu/worker.py` desta branch, preservando a configuração privada existente e `YT_ENABLED=1`. A base desse worker veio de `main` (`e08b998`, correção já usada na operação); `release/loops-20260921` não a continha.
3. Publicar `import-song-audio` com verificação JWT e depois o frontend.
4. Conferir upload e importação reais com uma música de teste, inclusive leitura por outro membro e retomada do ensaio.

Antes de publicar a árvore integrada completa, incorporar também os ajustes posteriores da página Download/APK 1.0.1, registrados no BrainHub em 23/09 e ainda fora da branch de integração. Esta tarefa não modifica o APK nem essa página. Clientes APK exigem novo empacotamento para receber a interface.

Durante esta sessão surgiram alterações locais concorrentes na `main` original em `LoopPanel`, `Presentation` e novos arquivos de sequência de loops/UX. Elas não foram feitas, descartadas ou integradas por esta tarefa. Conferi-las na integração da release para preservar esse trabalho.
