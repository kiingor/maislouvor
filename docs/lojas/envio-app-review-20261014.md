# Envio da primeira revisão — 14/10/2026

## Estado confirmado

**Envio confirmado em 14/10/2026 às 09:11:14 BRT.** No App Store Connect,
**1.0.0 (16)**, o grupo e as **66 assinaturas** estão em `WAITING_FOR_REVIEW`,
totalizando **68 itens** no mesmo envio. A confirmação foi vista no Safari e
conferida novamente pela API: versão, grupo e os 66 produtos aguardando revisão.
Publicação configurada como **MANUAL**; aprovação ainda pendente e app ainda não
publicado na loja.

O envio anterior, feito às 23:53 BRT de 13/10, continha somente o aplicativo.
Foi cancelado e substituído pelo envio combinado com as primeiras assinaturas.
O bloqueio do Mac interrompeu a preparação; o titular desbloqueou a máquina e o
controle visual foi retomado normalmente. O envio final ocorreu pelo Safari.

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
enviados junto à versão 16. Os 31 produtos anuais receberam as imagens finais
recapturadas. A Apple exigiu removê-los temporariamente do rascunho para substituir
os anexos; todos foram recolocados antes do envio. A conferência final validou
66/66 checksums de imagem e processamento COMPLETE.

## Capturas e correção da configuração do StoreKit Testing

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
região do processo de teste não resolveu. O simulador estava com região
pt_BR. Valores com vírgula no arquivo .storekit também não são solução: alteram
o preço exibido para 26,00.

**Resolvido:** pela interface de Ajustes do simulador, foi alterada somente a
região do próprio dispositivo para Estados Unidos (`pt_US`), conservando idioma
Português, storefront **BRA** e locale de metadados **pt_BR** no StoreKit Testing.
O teste independente passou a retornar preço numérico **26.9**, preço formatado
**R$ 26,90** e `priceString` **26.9**. Alterar somente a região do processo de
XCTest não bastava; o serviço do simulador usava a região do dispositivo.

As quatro capturas anuais foram refeitas na interface original, sem edição de
pixels. Conferidos os totais anuais e economias: Essencial R$ 33,80; Estúdio
R$ 73,80; Asafe R$ 53,80; Completo R$ 83,80. Os PNGs anteriores ficam em
`superseded-storekit-region` apenas para rastreabilidade. JPEGs finais sem alfa,
2064×2752, manifesto de hashes atualizado. Teste hospedado final encerrado com
sucesso e assertiva de nenhuma transação criada.

Não houve mudança de código, preço ou região de distribuição por esse
procedimento. A configuração é exclusivamente do simulador de captura.

## Limite do teste de acesso

Na sessão de captura, após digitar credenciais válidas da demo, o primeiro login
ficou carregando; a sessão foi salva e o início carregou após reabrir o app.
A abertura normal posterior também recuperou a conta e os dados fictícios. Uma
tentativa de sair no simulador não mudou de tela durante a observação. Não foi
estabelecida a causa nem reproduzido esse comportamento em dispositivo físico
com a distribuição da compilação 16. Não afirmar que esse fluxo está corrigido.

As notas privadas enviadas à Apple incluem a orientação de reabrir o app se o
login inicial permanecer carregando. As validações físicas anteriores de
Google/Apple/Face ID e compra/restauração são evidências separadas; não converter
um teste de acesso por API em prova de UX de login sem falhas. Se o comportamento
ocorrer na distribuição real, investigar autenticação/sessão em uma próxima
correção, sem mascarar o problema com a captura.

## Próximos passos

1. Aguardar o resultado da revisão da Apple e tratar eventual solicitação real.
2. Se a análise ultrapassar 27/10 às 23:34 BRT, conferir a vigência do acesso
   Sandbox restrito da conta fictícia de revisão antes de ampliá-la.
3. A publicação continua manual. Aprovação e liberação pública são etapas
   distintas; esta sessão enviou para revisão, não publicou na loja.
4. Revalidar a limitação de primeiro login acima no binário distribuído quando
   houver oportunidade, registrando ambiente e resultado. Nenhuma correção desse
   fluxo foi implementada nesta etapa.

Referências oficiais:
[primeiras compras e API](https://developer.apple.com/documentation/appstoreconnectapi/managing-in-app-purchases),
[envio do app](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app).

Evidências e scripts de continuidade ficam no diretório privado
`/Volumes/MaisLouvorBuild/AppReview-1.0.0-16` e em `/tmp/ml-asc-api.mjs`.
Os JSONs privados contêm dados de acesso e não devem ser impressos ou adicionados
ao Git. `final-review-verification-private.json` registra os 68 itens aguardando
revisão e os 66 checksums finais; `brazil-verification-before-final-submit.json`
registra os 66 preços/territórios conferidos. Confirmação visual em
`submission-confirmed.png`. Nenhuma nova compilação, publicação web ou mudança
nas equipes reais foi feita nesta etapa.
