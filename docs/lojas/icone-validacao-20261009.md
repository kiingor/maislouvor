# Ícone e validação inicial da ficha — 09/10/2026

## Ficha Apple

App **6819834048**, versão **1.0.0**. O salvamento feito pelo titular foi
confirmado após recarregar: telefone de contato presente, credencial da demo
coincidente com o arquivo privado e notas de revisão completas. Nenhum desses
dados privados foi copiado para este registro.

**Adicionar para revisão** retornou pendências de categoria primária,
classificação etária, compilação, privacidade e direitos de conteúdo. A versão
não entrou na fila de análise.

Foram preenchidos e confirmados após recarregar:

- Categoria primária **Música**.
- Questionário etário: conteúdo de usuários, mensagens/chat e publicidade
  presentes (o player YouTube pode exibir anúncios); sem controle parental,
  verificação técnica de idade, feed social ou navegador irrestrito.
- As categorias de conteúdo adulto, saúde, sexualidade, violência e jogos de
  azar não fazem parte da experiência prevista do app e foram marcadas ausentes.
- Classificação calculada global de 4+, substituída por **13+** para acompanhar
  `MIN_AGE = 13` nos termos; URL de adequação `https://maislouvor.com/termos`.
  A Apple aplica equivalências regionais. Não foi selecionado Feito para crianças.

O formulário de direitos foi inspecionado e fechado sem resposta: a alternativa
afirmativa também declara possuir os direitos necessários. Acesso a conteúdo de
terceiros existe; não há evidência para afirmar a posse dessas autorizações.
Gestão/importação somente na web não elimina essa pendência.

## Ícone

O projeto e o archive 9 já continham o monograma original do +Louvor. O PNG
1024×1024 era opaco, mas tinha cantos brancos decorrentes de arredondamento
pré-aplicado. O Xcode deve receber um quadrado com fundo completo.

`scripts/gen-ios-icon.mjs` regenera o PNG diretamente da marca vetorial
`public/favicon.svg`, mantendo desenho, escala e cores. Remove o arredondamento
prévio, usa sRGB e remove o canal alpha. Não modifica os assets Android.

Verificações: dimensão 1024×1024, RGB/sRGB, ausência de alpha e quatro cantos
`#121212`; inspeção visual; compilação do catálogo pelo `actool` para iPhone/iPad,
com saída bem-sucedida em `/Volumes/MaisLouvorBuild/Icon-Validation-20261009`.

O ícone da ficha vem do binário enviado. **As compilações 1 a 9 estavam todas
desabilitadas no seletor da versão.** O build 9 foi exportado para TestFlight
Internal Only, incompatível com revisão pública. A ficha ainda não tinha um
binário associado; não há upload independente de PNG para substituir esse fluxo.

## Compilação 10 enviada

Fonte congelada `e497632f1d7c1e314ae0a22b506cf3eb16bd9d9e` em
`/Volumes/MaisLouvorBuild/Release-1.0.0-10`, usando a configuração pública de
produção já validada na compilação 9. Testes: **61 arquivos, 525 testes passaram**;
typecheck, guarda de documentos, build de loja e sincronização Capacitor passaram.
A compilação usa o NVMe autorizado. O archive concluiu com sucesso, identificador
`com.maislouvor.app`, versão **1.0.0 (10)**, ícone primário `AppIcon` e 224 arquivos
web idênticos aos da fonte sincronizada. Ícone SHA-256:
`36e42236ab1c07e730103786aed11a9cb6e1499b52b3f012a9406ea58b59072e`.

O upload concluiu em **09/10/2026 14:49:34 (-03:00)**, com **EXPORT SUCCEEDED**.
Foi usado `app-store-connect`, destino `upload` e
`testFlightInternalTestingOnly=false`, preservando a release manual no painel.
Archive em `/Volumes/MaisLouvorBuild/Archives/MaisLouvor-1.0.0-10.xcarchive`;
opções, manifesto e logs na pasta da fonte congelada. O envio do binário não
equivale ao envio da versão para App Review.

O processamento concluiu: **Pronta para envio**. A compilação 10 foi selecionada,
associada à versão e salva. Após recarregar, o build **10** permanece associado e
o lançamento continua **manual**. Inspeção visual confirmou a marca no cabeçalho
do App Store Connect; evidência local `app-store-icon-confirmed.png` na pasta da
release, sem credenciais da demo.

A segunda validação **Adicionar para revisão** apontou somente quatro campos
pendentes: privacidade, direitos de conteúdo, screenshot iPad de 13″ e screenshot
iPhone com Dynamic Island (tela média). Nenhuma submissão para análise foi criada.

O grupo interno existente **Teste iPhone**, com um tester, foi associado ao build
10. As notas de teste informam o ícone, ajustes de texto e a validação ainda
pendente de ofertas/compra/restauração. Não foram criados grupos ou convidados
novos testers. Após recarregar, grupo e notas persistiram. Na página do grupo, o
registro do tester mostra **Instalado 1.0.0 (10)** no iPhone 17 Pro Max. Isso
confirma disponibilidade no TestFlight; não confirma compra/restauração. A lista
geral continua mostrando **Pronta para envio**, referente ao fluxo de submissão,
mesmo com o tester interno já instalado.

## Pendências preservadas

- Privacidade: finalidades/vínculos e fluxo YouTube precisam da conferência
  indicada em `preenchimento-app-store-20261009.md`.
- Direitos de conteúdo não declarados por falta de evidência.
- Falha `ML-IOS-OFFERINGS-23-BRA`, compra/restauração e acesso pago não validados.
- Capturas finais e QA da demo no binário. A interface atual da Apple mostra o
  slot principal **iPhone com Dynamic Island (tela média)** vazio: 0/10 capturas,
  aceitando 1179×2556 ou 1206×2622 em retrato; também há iPhone Duo e iPad de 13″.
  As prévias antigas 1320×2868 precisam ser reavaliadas diante desses slots.
- Demais testes de separação/Asafe e concorrência descritos no registro anterior.

Fontes Apple: [ícone fornecido pelo build](https://developer.apple.com/help/app-store-connect/manage-app-information/add-an-app-icon/),
[máscara aplicada pelo sistema](https://developer.apple.com/design/human-interface-guidelines/app-icons/),
[TestFlight interno não serve para App Review](https://developer.apple.com/tutorials/develop-in-swift/test-your-beta-app),
[envio em duas etapas](https://developer.apple.com/help/app-store-connect/manage-submissions-to-app-review/submit-an-app),
[idade mínima e substituição](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating).
