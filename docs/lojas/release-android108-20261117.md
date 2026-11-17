# Android 1.0.8 (9) — roteiro mobile

## Estado

Pacote 1.0.8 (9) compilado, assinado e validado; QA nativa concluída. Rascunho criado
no teste fechado Alpha; pacote ainda não enviado e publicação não concluída.
A chave original de upload não foi localizada após a migração. O usuário
autorizou gerar outra; o Google confirmou ativação em **19/11/2026 às 14:40
(America/Fortaleza), 17:40 UTC**. Até esse horário o serviço bloqueia upload
de qualquer novo pacote de app ou APK.

## Fonte e escopo

- Fonte final: `df8a909`, base `d2a4260`, correção de interface `89f641a` enviada ao iOS.
- Menu de três pontos verticais no canto superior direito de cada música,
  tom abaixo no celular e áreas de toque separadas.
- A versão Android anterior 1.0.7 (8) foi construída de `d384668`, a mesma
  base anterior ao ajuste. Código nativo, plugins, login e dependências
  permanecem compatíveis; o novo pacote preserva as configurações Android.
- A configuração pública de compras Google não estava no bundle iOS.
  O novo build de loja recompila os assets com a configuração Android anterior,
  carregada em memória, sem incluir seus valores neste documento ou no Git.
- Não altera backend, catálogo de assinaturas, testadores ou países.

## Google Play

- Pacote: `com.maislouvor.app`.
- App: `4972080730623843909`.
- Conta de desenvolvedor: `6722061799796684003`.
- Teste fechado Alpha: faixa `4698888679988149607`, rascunho da release `2`.
- Antes desta entrega: 1.0.7 (8) disponível no Alpha e no teste interno;
  produção inativa. Alpha cobre 178 países/regiões.
- Publicação gerenciada desativada, sem mudanças pendentes antes deste trabalho.
- Notas em pt-BR preparadas, com foco em legibilidade do roteiro e controles.

## Evidências

Pasta local `~/HomeLab/MaisLouvor/builds/Play-1.0.8-9-20261117/`.
`preflight-console.json` registra o estado anterior observado na sessão autenticada.
`release-notes-pt-BR.txt` contém o texto da atualização.

A interface tem a mesma fonte validada em 15/11 em 320, 360, 390, 430 e 1024 px,
editor e visualizador. SHA-256 de `src/pages/CultoDetail.tsx`:
`5fc495844ad2c92dd18bc0c67519061064f0b64729344487a7ac7badaa4b10c3`.

Typecheck, build de loja, sincronização Capacitor e Gradle `bundleRelease` /
`assembleRelease` passaram. AAB e APK assinados com a nova chave de upload;
assinaturas e alinhamento ZIP de 16 KiB verificados. Comparação direta com o
APK 1.0.7 confirmou as mesmas configurações de Capacitor, RevenueCat Google /
Apple e os cinco recursos Firebase presentes no pacote anterior.
As quatro bibliotecas nativas são idênticas às do pacote 8 e têm alinhamento
ELF de 16 KiB. Android mínimo API 24, target 36, permissões preservadas e
release não depurável. AAB sem arquivos de ambiente, chaves privadas ou senhas.
Resumo da preparação: `validation/preparation-manifest.json`.

Artefato para envio: `artifacts/MaisLouvor-1.0.8-9.aab`, SHA-256
`a7e015774a86d5c44cb7f460fff880601322bc45d120dab0714af8dd8ae82aca`.
O APK `*-upload-key-qa.apk` serve à validação local; não substitui o APK
distribuído e assinado pelo Google Play.

Emulador Pixel 8a / Android API 36: o APK anterior e a instalação limpa do APK
novo abriram o login completo; reabertura a frio do novo APK também passou.
Logs sem fatal, ANR ou exceção JavaScript. Relatório final em
`builds/Validation-play-20261117/validation-result.json`, com capturas de tela.
Emulador desligado ao terminar. Login autenticado e compras não foram exercitados.
Não foi validada atualização pela Play Store: depende da ativação da nova chave
e do envio à loja. Instalar o novo APK local sobre o antigo não representa esse
fluxo, pois as chaves de upload são diferentes.

## Chave de upload

Solicitação enviada na página de assinatura do app, motivo "Perdi a chave de
upload". O console confirmou processamento até 19/11/2026 às 17:40 UTC e a
impressão digital do novo certificado. A chave de assinatura
do app, gerenciada pelo Google Play e usada nos dispositivos, não foi alterada.

Nova chave de upload RSA 3072, validade de 10000 dias. Referências de assinatura
e orientação de preservação ficam em
`~/.local/share/maislouvor/signing/upload-20261117/`, com diretório e arquivos
restritos. Nenhuma chave privada ou senha é incluída no Git.
Comprovante público da solicitação: `upload-key-reset.json` na pasta da entrega.

## Retomada do envio

A partir de 19/11/2026 às 14:40 (Fortaleza), confirmar a ativação da chave no
console e enviar o AAB assinado acima no rascunho Alpha da release 2. Conferir
processamento, versão 1.0.8 (9), notas, países e público preservados, então
concluir o lançamento/revisão e registrar o estado real retornado pelo Google.
Não é necessário reconstruir o pacote, salvo se houver alteração ou rejeição.

Foi oferecido agendamento da retomada ao usuário; não houve autorização para
criar automação até o fechamento desta preparação. O envio continua pendente.

O checkout principal com trabalho antigo foi preservado. Não houve push ou
alteração na versão Apple nesta entrega.
