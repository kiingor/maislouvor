# Demora ao iniciar músicas no iOS — 11/10/2026

Filipe confirmou que o mixer da compilação 13 funciona. A demora acontece ao
abrir/trocar de música, e não ao pausar e retomar a mesma música.

## Diagnóstico medido

O AVAudioEngine usa arquivos locais. A compilação 13 esperava baixar o arquivo
completo para emitir `canplay`, apagava-o ao trocar de música e desabilitava no
iOS o pré-carregamento da próxima música que já existia na web.

Leitura autorizada, sem mudanças, de dois originais do culto da equipe IMJP:

| Música | Tamanho | Assinatura da URL* | Download HTTP no Mac |
| --- | ---: | ---: | ---: |
| A Começar Em Mim | 4.183.724 bytes | 89 ms | 1.684 ms |
| Todo Som | 13.586.733 bytes | 78 ms | 4.651 ms |

*Assinatura feita pelo diagnóstico com credencial de serviço em memória; não
é uma medição de RLS nem da conexão do iPhone do usuário.

No plugin da versão 13, em outra requisição no simulador, carregar os arquivos
levou 1.144/1.328 ms; iniciar o motor após o carregamento levou 40/12 ms e
retomar após pausa levou 10/9 ms. Há aquecimento de rede/cache entre medições.
Isso identifica a espera pelo download completo como gargalo de abertura;
não demonstra saturação do servidor, nem demora de soma/separação das faixas.
Não foi medida a velocidade da rede móvel do usuário.

## Correção preparada para 1.0.0 (14)

- Pré-carrega somente o próximo original, depois dos downloads atuais.
- Não cria um player de fundo que interfira na duração ou no relógio atual.
- Selecionar uma música em pré-carregamento aproveita o mesmo download em curso.
- Download necessário à música atual tem prioridade; cancela pré-carga alheia
  quando precisar da rede. Um acerto de cache não cancela a pré-carga em andamento.
- Reutiliza arquivos comprimidos durante a sessão de ensaio, inclusive stems.
- Cache por URL assinada exata, sem persistência entre sessões/contas. Limite de
  96 MiB para arquivos inativos; faixas ativas e o próximo original são protegidos
  da remoção. Limpa ao sair; também limpa resíduos após reiniciar o app.
- Mantém o transporte e o mixer sincronizado da versão 13. Nenhuma migração,
  alteração, duplicação, exclusão ou reprocessamento das músicas existentes.
- Web/Android continuam no player existente. Não requer APK por esta correção.

Limite conhecido: a primeira música, uma seleção fora da próxima prevista e um
arquivo removido por falta de espaço ainda precisam baixar integralmente. Não
há promessa de reprodução instantânea em qualquer conexão.

## Validação

- Typecheck, build de loja, 573 testes em 67 arquivos e Swift Debug aprovados.
- Dois originais reais lidos no simulador: carregamento inicial de 1.022 ms;
  seleção do pré-carregado e retorno ao anterior de 1 ms cada, sem novo download.
  Repetição anterior: 2 ms cada. Tempos de preparação, não latência auditiva no
  iPhone físico. Sinal de áudio manteve-se presente durante a pré-carga.
- Promoção de pré-carga em curso sem duplicação; troca rápida/cancelamento;
  rejeição de origem não permitida; limpeza de sessão antiga sem afetar a nova;
  cache e downloads zerados após reset.
- Harness privado: `/Volumes/MaisLouvorBuild/Audio-Incident-20261009`.
  As contagens de diagnóstico existem somente no binário Debug.

## Entrega

Fonte e testes preparados. Registrar o resultado de archive/upload e a liberação
no grupo Teste iPhone após confirmação; ainda não afirmar disponibilidade.
