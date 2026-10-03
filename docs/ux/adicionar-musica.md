# Adicionar música — proposta de experiência

Abra [o protótipo interativo](./adicionar-musica.html). Os controles externos permitem explorar popup, busca e cadastro, alternar desktop/celular e aparência clara/escura. **Simular preenchimento** oferece três opções: **Preencher informações** (capa, tags, dados, cifra, letra e link, sem áudio importado), **Deixar música pronta** (áudio e seis faixas simuladas, direto na revisão) e **Limpar cadastro**. Para testar a preparação, escolha a primeira opção, avance e use **Importar áudio da gravação → Cortar a gravação → Separar em faixas**.

**Estado da avaliação:** o usuário aprovou o popup e a busca. Esta revisão preserva os dois e reformula apenas o cadastro, atendendo à correção de que todos os campos e recursos atuais precisam continuar disponíveis. O link da gravação passa a orientar a preparação para a separação. Tags e capa ficam na primeira etapa. O novo cadastro continua em avaliação.

Após o pedido de diminuir a altura da camada, o cadastro recebeu cabeçalho, blocos, capa e espaçamentos verticais mais compactos. As áreas de toque permanecem com pelo menos 44 px de altura. A moldura de desktop fica limitada a 880 px e se adapta à altura da janela; na conferência de desktop, a prévia inteira coube sem rolagem da página. No celular, a moldura também foi reduzida. Campos e recursos foram preservados.

Os campos de tom original, tom da equipe e tom das faixas agora usam um seletor no padrão dos demais campos, com 44 px de altura e busca interna. Aceita cifras e nomes em português, sem depender de acentos: `Gm`, `Sol menor`, `Re bemol` ou `Bb`. Oferece tons maiores/menores, sustenidos/bemóis e a opção **Igual ao original** para a equipe. A correspondência mais próxima aparece primeiro. Setas navegam, Enter escolhe e Escape fecha o seletor e devolve o foco ao campo.

## Referência examinada

A `main` desta pasta está no commit `3ebed276`, mas contém a versão antiga de `AddSongModal`, sem busca de cadastradas. A referência do fluxo citado pelo usuário é a branch `redesign/ios27`, no worktree `MaisLouvor-redesign-ios27`, commit `d38ee53a`: `src/components/AddSongModal.tsx`, `src/pages/SongEditor.tsx`, `src/components/RepertorioDashboard.tsx` e os tokens em `src/index.css`. A identidade Git é a mesma (`github.com/kiingor/maislouvor`); as branches não devem ser confundidas.

A busca vigente obtém toda a biblioteca da equipe, filtra título/artista no navegador e não filtra completude. O cadastro cria uma música apenas com título, vincula imediatamente ao repertório e abre um editor com metadados, cifra, mídia e ferramentas de ensaio na mesma tela. O painel considera incompleta uma música sem tom atual, tema, arquivo de áudio ou cifra.

O cadastro revisado também foi conferido contra `CoverUpload`, `AudioUpload`, `AudioTrimmer`, `StemPreviewPlayer`, `SongAudioAttachments`, `SongRepertoriosCard` e `src/lib/chordpro.ts`. O acesso ao Moises existe na `main`; a branch de redesign mantém seu handler, mas não renderiza o acionador. A proposta conserva esse acesso para atender à solicitação de não perder recursos.

## Escopo da prévia

Este é um **protótipo**, solicitado para avaliar a experiência. As ações usam dados ilustrativos em memória e não chamam Supabase. Recarregar apaga seleções, cadastros e rascunhos. Arquivos selecionados são lidos apenas pelo navegador local. Nenhum componente do aplicativo, dado real ou versão publicada foi alterado.

Importação por URL, separação de instrumentos e detecção de BPM/tom são simuladas com quatro segundos de uma progressão instrumental original. O aviso fica no comparador, fora da interface do produto. A prévia do link ilustrativo também é local; somente ao escolher conferir um link real, a janela carrega o player do YouTube.

A mistura demonstra os controles de faixas e reproduz o mesmo áudio original com volume global aproximado; não são seis gravações realmente separadas. A transposição do áudio não executa DSP. O corte guarda um intervalo e permite ouvi-lo, sem exportar um novo arquivo. A cifra usa uma transposição local simplificada, preservando linhas de letra e espaçamento. A implementação deve reutilizar os componentes e o parser musical atuais, em vez de transportar essa lógica de demonstração para produção.

## Fluxo proposto

1. **Adicionar música:** duas opções, **Buscar músicas** e **Cadastrar nova**. A importação do Cifra Club foi removida do popup.
2. **Buscar músicas:** pesquisa por nome, artista ou tags, sem distinguir acentos/maiúsculas; filtros combináveis de tema, tom e artista; ordenação por nome, artista ou cadastro recente. Contagem apenas de completas. Dados iniciais: 54 músicas completas, seis sentinelas incompletas excluídas e três músicas vinculadas.
3. **Selecionar e adicionar:** páginas de 6/12/24, navegação numerada e anterior/próxima. Seleções persistem entre páginas, pesquisas e filtros. Chips removem escolhas. **Ver selecionadas** reúne escolhas; **Voltar à busca** restaura os filtros anteriores. Vínculos existentes são identificados e não podem ser duplicados.
4. **Conferir uma versão:** a prévia apresenta artista, tema, tom e presença de cifra/áudio. Os exemplos do catálogo não incluem letras ou cifras atribuídas aos artistas; cifra, capa e áudio do exemplo de cadastro são originais desta demonstração.
5. **Cadastrar nova:** **Informações → Preparar música → Revisar**. Na preparação, as abas **Gravação**, **Cifra e letra** e **Faixas** agrupam as ferramentas. A revisão reúne os dados, os recursos e os repertórios de destino, com atalhos para editar.
6. **Salvar rascunho:** os dados e recursos preparados são guardados nesta prévia. O rascunho não entra na busca nem no repertório. Imports pendentes podem ser retomados. Depois de completo e confirmado, o cadastro entra na biblioteca e nos destinos escolhidos.

No celular, a folha tem cabeçalho e ações fixos, com corpo rolável. Os filtros da busca aprovada ficam em um painel expansível e os filtros ativos permanecem visíveis.

## Recursos do cadastro revisado

| Recurso vigente | Onde aparece na proposta |
| --- | --- |
| Capa, nome, artista, tema e tags | Informações; tema com sugestões e edição livre; tags por Enter, botão ou sugestões, com remoção individual |
| Tom original e tom da equipe | Informações; seletores com busca por cifra/nome; o tom da equipe acompanha a transposição da cifra |
| Link de mídia e prévia do YouTube | Gravação, em destaque; botão para conferir a versão |
| Importar do YouTube ou enviar arquivo | Gravação; estados de importação e áudio preparado |
| BPM com detecção e duração | Gravação; duração obtida do arquivo e edição manual |
| Corte da gravação | Gravação; início/fim, ouvir, resetar e aplicar antes da separação |
| Separar instrumentos por IA | Gravação → Faixas; processamento e seis instrumentos |
| Reprodução, volume, mute, solo e reset | Faixas; M/S têm explicação visível e nomes acessíveis |
| Tom das faixas, detecção e transposição | Faixas; tom original com busca, passos de meio tom e reset |
| Faixas prontas de outro serviço | Faixas; múltiplos arquivos, conservando o acesso do componente legado |
| Cifra e letra | Abas próprias, seções e prévia de acordes destacados |
| Transposição da cifra | Cifra; −½ / +½, original e usar tom da equipe |
| Importação do Moises | Cifra; colar texto completo e conferir metadados/conteúdo |
| Áudios adicionais | Gravação; arquivo/YouTube, ouvir, renomear, remover e retomar importação |
| Múltiplos repertórios | Revisar; origem pré-selecionada e outros destinos ilustrativos |
| Histórico nos cultos | Revisar; estado vazio correto para uma música nova |
| Exclusão/descarte | Revisar; descartar cadastro ou excluir rascunho com confirmação local |
| Trechos para repetir | Faixas; nome, intervalo, salvar, repetir e remover |

Trechos/loops pertencem aos componentes de ensaio do produto; nesta proposta ficam agrupados em Faixas. Histórico não é um campo de cadastro: novas músicas mostram o estado vazio e músicas existentes continuam tendo suas datas e cultos.

## Regra de música completa

Para este estudo, são necessários **nome, artista/ministério, tom original, tema, cifra e áudio preparado**. Nome/artista identificam a versão em uma base grande; cifra/áudio/tom/tema acompanham o indicador do painel. A regra pode ser consultada ao lado de **Somente músicas completas**. É uma proposta de experiência, sem alteração de regra no banco.

Capa, tags, letra separada, BPM, duração manual, faixas separadas e áudios adicionais são opcionais. **O link é uma entrada para obter a gravação.** YouTube permite iniciar a importação; arquivo é a alternativa. Links de outros serviços ficam salvos para consulta, sem prometer extração deles.

Uma URL sozinha não significa que o áudio esteja pronto. Se o link mudar após importar, é preciso importar novamente ou escolher um arquivo para a versão. Imports de áudios adicionais iniciados precisam concluir ou ser removidos antes de confirmar. Rascunhos guardam imports pendentes para retomar. A verificação de cifra considera preenchimento, sem comprovar correção musical. Em produção, o upload/importação deve estar confirmado e a regra precisa ser compartilhada entre cadastro, painel e catálogo.

## Implementação posterior para uma base grande

A prévia pagina uma lista local. No aplicativo, **pesquisa, filtros, ordenação, exclusão de incompletas e paginação precisam ocorrer no servidor**, retornando somente a página pedida e sua contagem. Não reproduzir a consulta que baixa toda a biblioteca.

- Respeitar a identidade da equipe e as regras de acesso atuais. A aprovação do estudo não expõe músicas privadas em um catálogo público.
- Retornar metadados leves; obter cifra e mídia somente ao abrir detalhes. Artistas/temas precisam de consultas próprias ou pesquisa paginada, incluindo temas personalizados.
- Manter a seleção por ID, ignorar respostas atrasadas e ordenar com desempate determinístico. Validar duplicidade de vínculo no servidor.
- Tratar criação e vínculos finais de forma consistente. Guardar rascunhos separados do cadastro publicado, com acesso da equipe/autor conforme o produto.
- Reutilizar Moises, transposição, corte, separação, áudios adicionais, loops e histórico. Associar áudio/faixas à versão exata da gravação e ao corte, invalidando resultados antigos quando a origem mudar. Preservar cache, filas, retentativas, falhas e permissões reais dos serviços.

## Arquivos

- `adicionar-musica.html`: comparador responsivo e controles externos de avaliação.
- `adicionar-musica-app.html`: telas, estilos, catálogo ilustrativo e interações da busca aprovada.
- `adicionar-musica-editor.js`: interações do cadastro reformulado e simulações locais.
- `assets/maislouvor-ios27.png`: ícone da marca existente, reutilizado.

Os dois HTML e o JavaScript funcionam juntos por HTTP local ou abrindo o comparador, sem fontes ou bibliotecas externas. O exemplo funciona offline; a prévia de um vídeo real depende do YouTube e só carrega ao ser aberta. Não houve commit, merge ou publicação.

## Verificação

A primeira proposta foi verificada no Chrome: popup, filtros combinados, paginação, seleções entre páginas, retorno da visão de selecionadas, adição em lote, exclusão de incompletas, rascunhos, cadastro final, temas e larguras de 390/320 px. O registro anterior do BrainHub conserva esse resultado.

Na revisão do cadastro:

- Regiões aprovadas comparadas ao HTML anterior: popup, busca, rodapé, funções de filtros/paginação/seleção e prévia/regra de qualidade preservados.
- Tag adicionada com Enter sem avançar etapa; importação simulada pelo link, corte de 0,5 a 3,5 segundos, separação com seis faixas, solo e transposição.
- Trecho de ensaio de 1 a 3 segundos; áudio adicional por YouTube; salvar rascunho durante importação, retomar e concluir. Tags, capa, link, cifra, faixas, ajustes, trecho e áudio adicional foram preservados.
- Associação ao repertório de origem e a outro destino; cadastro final aumentou a biblioteca de 54 para 55 completas e apareceu na busca como **Já no repertório**.
- Moises: URL sozinha rejeitada; conteúdo original com nome/artista/tom importado. Transposição G → G# preservou a letra e atualizou o tom da equipe na revisão.
- Troca do link após importar bloqueou o avanço; retornar ao link importado restabeleceu a revisão.
- Inspeção visual no desktop, celular de 390 px (376 px internos), tema escuro e viewport de 320 px (305 px internos). Corrigidos deslocamento do diálogo durante foco/rolagem e largura mínima do conteúdo/botões. Após a correção, título/rodapé ficaram visíveis; corpo, gravação, faixas e revisão sem overflow horizontal. Mute/solo mediram 44 × 44 px; botão final coube com texto em duas linhas em 320 px.
- Sintaxe JavaScript, IDs, rótulos e símbolos conferidos. Registro do Chrome sem erros/avisos de JavaScript nos fluxos examinados. Janela restaurada ao tamanho padrão.
- Ajuste de compactação: inspeção de Informações no desktop, moldura de 880 px e página dentro da altura disponível; Gravação em 320 px com conteúdo e ações dentro da largura, sem overflow horizontal. O botão Continuar manteve 44 px e o cabeçalho/rodapé permaneceram visíveis.
- Seletor de tom: busca por `Sol menor`, `Re bemol`, `Bb` e `Si bemol`, estado vazio, escolha com setas/Enter, opção de tom da equipe igual ao original, retorno de foco e Escape sem fechar o cadastro. `Sol menor` passou a mostrar `Gm` primeiro. O tom das faixas `Bb` permaneceu após ajuste de transposição; `Gm` e `Bb` foram preservados ao salvar e retomar um rascunho. A validação de tom ausente focou o seletor visível.
- Simulação: informações preenchidas com gravação pendente; música pronta com áudio, seis faixas, revisão e confirmação habilitada; limpar cadastro com campos e recursos vazios. Inspeção dos seletores no desktop e em 320 px, nos temas claro/escuro, sem overflow horizontal. A busca reinicia a rolagem dos resultados; abrir o seletor por clique direto não deslocou o corpo do cadastro. Redimensionar fechou o menu. Janela e tema restaurados; console sem erros/avisos.

São verificações de protótipo com dados ilustrativos. Não equivalem a testes de paginação no servidor, carga de uma base grande, persistência, upload remoto, importação real de YouTube/Moises, processamento de áudio ou aparelho físico. **Popup e busca aprovados; cadastro revisado em avaliação.**
