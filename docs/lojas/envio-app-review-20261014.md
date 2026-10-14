# Preparação da primeira revisão — 14/10/2026

## Estado confirmado

**Ainda não concluído o envio combinado.** No App Store Connect, a versão
**1.0.0 (16)**, o grupo de assinaturas e os **66 produtos oferecidos** estão em um
único rascunho `READY_FOR_REVIEW`, totalizando **68 itens**. Compilação 16 válida,
elegível para App Store; publicação configurada como **MANUAL**.

Havia um envio aguardando revisão que continha somente o aplicativo, enviado às
23:53 BRT de 13/10. Foi cancelado para incluir as primeiras assinaturas junto ao
binário. O cancelamento está concluído. Não confundir esse envio anterior com o
rascunho combinado atual, que ainda precisa ser enviado.

O Mac bloqueou a tela durante a conferência final. O controle visual retornou
erro de desbloqueio automático, e foi solicitado ao titular desbloquear o Mac.
Não houve tentativa de contornar o bloqueio. Ações independentes pela API
oficial continuaram para preparar e conferir os metadados.

## Conteúdo, acesso e notas

- O titular informou que aceitou o contrato Apple atualizado.
- O titular confirmou as autorizações de conteúdo e corrigiu a declaração para
  **uso de conteúdo de terceiros**. A API confirmou essa opção. Isso registra a
  declaração do titular; não equivale a auditoria independente de licenças.
- Notas de revisão atualizadas e salvas na Apple, preservando os campos privados
  de login, contato e convite Asafe. O roteiro público está em
  [notas-revisao.md](notas-revisao.md), com marcadores para os dados privados.
- Repertório da Demonstração conferido com três músicas selecionadas: Manhã de
  Graça, Rio de Paz e Baby Bird (demo). Corrigida nas notas a referência antiga a
  seis músicas nesse repertório. Não foram alteradas músicas das igrejas reais.
- Conta fictícia de revisão habilitada para Sandbox de forma restrita à própria
  equipe e à App Store, até **27/10/2026 às 23:34 BRT**. Verificadas titularidade e
  marcação de demonstração antes da alteração. Plano gratuito/manual e cinco
  integrantes preservados; nenhuma assinatura paga foi concedida manualmente.
- Compra, sincronização e restauração já validadas em iPhone físico com
  desenvolvimento e Apple Sandbox Brasil. Essa evidência não revalida o erro
  anterior do TestFlight com a conta Apple pessoal.

## Assinaturas

O grupo contém 70 registros; apenas os 66 efetivamente oferecidos pelo app foram
preparados. Quatro produtos anuais não oferecidos ficaram fora desta etapa.
Localizações pt-BR, notas específicas, período e capacidade foram conferidos.

Os 66 produtos receberam captura de revisão, com processamento de imagem
`COMPLETE`. Foram criadas oito capturas representativas, uma por família e
período, com seletor de dez integrantes. Cada nota explica a capacidade do
exemplo e o caminho para selecionar a capacidade específica do produto.

A validação de inclusão em revisão retornou inicialmente
`STATE_ERROR.IAP_SUBMISSION_NOT_ALLOWED_MISSING_PRICING_DATA`: existia apenas o
preço Brasil, mas a Apple exigiu preços UPFRONT para os outros 174 territórios.
Foram utilizadas as equalizações oficiais do ponto de preço brasileiro de cada
produto, preenchendo somente as entradas ausentes. Não foram inventadas
conversões nem alterados os preços brasileiros.

Conferência final dos **66/66** produtos: ponto de preço original do Brasil
preservado, disponibilidade somente **BRA**. A tabela de preços em outros países
não significa liberação de venda nesses países. O grupo e os 66 produtos foram
incluídos no mesmo rascunho que a versão 16.

## Capturas e divergência no StoreKit Testing

Arquivos externos ao Git: `/Volumes/MaisLouvorBuild/AppReview-1.0.0-16/screenshots`.
Oito PNGs originais de framebuffer e cópias JPEG RGB 2064×2752 para upload, sem
edição de conteúdo. Manifesto com hashes e README com procedência no diretório.
Capturas públicas previamente cadastradas: seis iPhone e cinco iPad, preservadas.

Captura em iPad Pro 13-inch (M5), iPadOS 27.0, usando uma cópia isolada dos assets
da fonte congelada `3dee928`, mesma interface da compilação 16. XCTest hospedado
inicializa StoreKit Testing com catálogo derivado dos preços/IDs/períodos reais
da API Apple. A conta acessa dados fictícios reais no backend. Não houve mock de
preço no DOM, compra ou alteração no app de distribuição. Testes encerrados com
assertiva de nenhuma transação criada.

**A conferência final detectou um problema nas capturas anuais:** o StoreKit 2
do simulador retorna `price = 26` e `displayPrice = R$ 26,90` para Asafe 10 mensal.
Isso reduz incorretamente o texto calculado de economia anual de R$ 53,80 para
R$ 43,00. Preços principais dos cartões e total anual aparecem corretos.

Diagnóstico nativo independente do React/RevenueCat confirmou a divergência em
`Product.products`. O JSON do próprio StoreKit Testing contém `priceString` com
vírgula (`26,9`), enquanto `Product.price` resulta em 26. Controles de
`JSONSerialization` com Decimal/Double 26.9 preservam os centavos. Mudar somente
`SKTestSession.locale`, usar duas casas decimais no arquivo ou alterar idioma e
região do processo de teste não resolveu. O simulador permanece com região
pt_BR. Valores com vírgula no arquivo .storekit também não são solução: alteram
o preço exibido para 26,00.

Não foi alterado código de produção por esse diagnóstico. Não concluir que a
API Apple ou o RevenueCat cobram valor errado a partir desse teste local.
Capturas anuais precisam ser refeitas após obter preços numéricos consistentes
no ambiente de teste. Próxima tentativa: conferir a região do próprio simulador
pela interface, mantendo loja BRA e metadados pt-BR. Ainda não validada; requer
desbloqueio do Mac. Arquivo original .storekit usa ponto decimal e os preços
brasileiros oficiais, e deve ser preservado.

## Próximos passos exatos

1. Desbloquear o Mac e retomar Safari/Device Hub pelo controle de interface.
2. Resolver a divergência local de preço do StoreKit Testing, recapturar as
   imagens anuais e substituir os anexos correspondentes, verificando o estado
   COMPLETE. Não retocar números na imagem nem representar um layout fictício.
3. Conferir visualmente o rascunho com **68 itens**, notas, compilação 16 e
   publicação manual. O titular já autorizou o envio; não pedir nova aprovação
   rotineira. A Apple orienta enviar a primeira compra junto ao binário pelo site.
4. Enviar o rascunho combinado no Safari e verificar `WAITING_FOR_REVIEW` tanto
   para a versão quanto para os produtos. Não declarar envio antes de confirmar.
5. Atualizar este registro e o BrainHub com o resultado real. Depois, acompanhar
   eventual retorno da Apple e conferir o prazo de acesso Sandbox da demo se a
   análise ultrapassar 27/10. Não configurar automação nova sem solicitação.

Referências oficiais:
[primeiras compras e API](https://developer.apple.com/documentation/appstoreconnectapi/managing-in-app-purchases),
[envio do app](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app).

Evidências e scripts de continuidade ficam no diretório privado
`/Volumes/MaisLouvorBuild/AppReview-1.0.0-16` e em `/tmp/ml-asc-api.mjs`.
Os JSONs privados contêm dados de acesso e não devem ser impressos ou adicionados
ao Git. `final-draft-state-private.json` registra os IDs e o último estado dos
68 itens; `final-brazil-price-availability-verification.json` registra os 66
preços/territórios conferidos. Nenhuma nova compilação, publicação web ou mudança
nas equipes reais foi feita nesta etapa.
