# Cadastro e busca de músicas — implementação aprovada

Atualizado em 29/09/2026. A implementação está pronta no checkout isolado `/private/tmp/maislouvor-song-registration-release-20260930/source`, branch `release/song-registration-20260930`. **Esta entrega ainda não foi publicada.** O ambiente passou a negar a conexão SSH com a VPS durante a validação.

O popup oferece buscar músicas ou cadastrar uma nova, sem a importação do Cifra Club. A busca usa filtros de tema, tom e artista, busca por nome/artista/tags, ordenação e páginas de 6, 12 ou 24 músicas. As consultas e a contagem acontecem no servidor; a seleção acompanha o usuário entre páginas e filtros. Músicas já presentes ficam identificadas. A inclusão em lote é validada e feita em uma transação.

O cadastro foi organizado em informações, preparação e revisão. Mantém capa, título, artista, tom original, tom da equipe, tema, tags, link da gravação, upload de áudio, corte, BPM, duração, separação de instrumentos, mixer, envio de faixas prontas, loops, áudios adicionais, cifra, letra, transposição, importação de texto do Moises, repertórios, histórico e exclusão. O campo de tom segue a altura e a aparência dos demais campos e permite pesquisar pelas cifras e pelos nomes em português.

A gravação é o centro da preparação: link da versão, importação real pelo serviço existente, corte e separação real pelo worker existente. Nenhum processamento é simulado no produto. O protótipo HTML mantém os controles de preenchimento para revisão. Rascunhos preservam informações e repertórios escolhidos, ficam fora da busca e da biblioteca e podem ser retomados. A inclusão no repertório só ocorre após a revisão.

A migração aditiva cria `is_draft`, `recording_source_url`, `audio_revision` e `draft_repertorio_ids`, os índices do catálogo e quatro RPCs com as permissões da equipe. Músicas completas precisam de nome, artista, tom, tema, cifra e áudio preparado. Uma gravação com link alterado fica fora do catálogo até a reimportação. Trocar ou cortar o áudio invalida as faixas geradas da versão anterior. O salvamento do formulário não sobrescreve o áudio ou a capa que um processamento em segundo plano acabou de preparar.

## Validação realizada

- Suíte completa: 165 testes em 20 arquivos passaram, incluindo 16 testes novos do fluxo e de uploads.
- Compilação de produção e geração do service worker passaram.
- TypeScript: mesmos 9 diagnósticos da base publicada; nenhum diagnóstico novo.
- Núcleo da migração validado na VPS com usuários/equipes/músicas sintéticos dentro de uma transação com `ROLLBACK`: paginação, pesquisa por prefixo e sem acentos, filtros, exclusão de campos ausentes/rascunhos, duplicidade, inclusão atômica, isolamento entre equipes, perfil viewer, exceções de permissão, publicação após conclusão e invalidação de faixas. Nenhum fixture ou mudança dessa transação foi persistido.
- O teste SQL final acrescenta a gravação alterada e a preparação em andamento. A execução dessa revisão final é obrigatória no publicador, antes de aplicar a migração; ficou pendente após o bloqueio de rede.
- A conferência visual da interface integrada ficou pendente: o ambiente negou iniciar o servidor local, e a política do navegador bloqueou a URL de arquivo da prévia. O protótipo aprovado já havia sido conferido na etapa anterior.

## Entrega e publicação pendente

A base é o snapshot da release `20260930-platform-admin`, que entrou no ar durante esta sessão. O pacote incorpora essa versão e preserva Asafe, administração, sugestões, a landing na raiz, o service worker da landing e os APKs existentes. A base esperada tem SHA-256 de `index.html` igual a `31ca90d49c6d0ac6756ecf90e74e7ecc0a7a7261575e67a36d1df7c3ee499092`; uma alteração posterior interrompe a publicação para evitar sobrescrever outra entrega.

O pacote está em `tmp/song-registration-release-20260930/` da pasta principal do projeto. Inclui arquivos compilados, código sem credenciais, patch contra o snapshot publicado, migração, teste SQL, relatório e publicador. O publicador verifica os hashes, usa o bloqueio de deploy existente, testa o banco com rollback, salva backups privados na VPS, aplica a migração, verifica o cache das RPCs, troca os arquivos do site e confere HTTPS. Se a troca do site falhar, restaura o site anterior; a migração permanece aditiva para preservar dados.

Depois de liberar o acesso de rede da sessão, usar `publish.sh` do pacote. A autorização do usuário para publicar já foi recebida. A migração desta entrega ainda não foi aplicada definitivamente; nenhum arquivo dessa entrega foi copiado para o site de produção; nenhum commit dessa implementação foi criado. A instalação Android não foi recompilada: esta entrega atualiza o app web/PWA.

O registro independente no BrainHub também ficou pendente: o ambiente negou criar o arquivo no vault. O resumo foi preservado em `tmp/song-registration-release-20260930/brainhub-pendente.md` para registrar quando a escrita estiver disponível.
