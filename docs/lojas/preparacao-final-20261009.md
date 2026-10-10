# Preparação final da Apple — 09/10/2026

> Atualização posterior: a biblioteca privada foi publicada e o TestFlight recebeu **1.0.0 (12)**; veja [publicação e QA](publicacao-biblioteca-privada-20261009.md). O registro abaixo descreve a preparação anterior da build 11; a ficha de distribuição ainda seleciona essa build.

## Estado confirmado

O **+Louvor 1.0.0 (11)** está **Em testes** no grupo interno **Teste iPhone**,
com o tester já existente. O App Store Connect processou o upload e a versão
1.0.0 seleciona a compilação 11. A ficha continua em **Preparar para envio**,
com lançamento manual. Não houve submissão para App Review nem convite novo.
No iPhone: TestFlight → +Louvor → Atualizar → conferir 1.0.0 (11).

Salvo e conferido por leitura no App Store Connect:

- Seis capturas nativas de iPhone (1206×2622) e cinco de iPad (2064×2752).
- Ícone incluído no archive e processado com a compilação.
- Notas para revisão e notas de teste, sem afirmar compras já validadas.
- App Privacy publicado com doze categorias vinculadas. User ID e Purchase
  History: Funcionalidade e Análise. Demais: Funcionalidade. Sem rastreamento
  identificado no escopo auditado do build 11.
- URLs de política e opções de privacidade salvas; classificação 13+ preservada,
  resposta sobre publicidade atualizada para o binário sem player YouTube interno.

## Fonte e artefatos

| Entrega | Evidência |
| --- | --- |
| Fonte iOS | `94b9a93ce35016718b8f70345f096cdaabf4d9bf` |
| Fonte congelada | `/Volumes/MaisLouvorBuild/Release-1.0.0-11-final` |
| Archive | `/Volumes/MaisLouvorBuild/Archives/MaisLouvor-1.0.0-11.xcarchive` |
| Upload | `Release-1.0.0-11-final/upload.log`: `EXPORT SUCCEEDED` |
| Capturas e hashes | `/Volumes/MaisLouvorBuild/AppStore-Screenshots-1.0.0-11` |
| Confirmações da Apple | `/Volumes/MaisLouvorBuild/Preparation-Apple-20261009/app-store-final-ui.json` |
| Web publicada | `20261009-web-privacy-stems`, fonte `7cf676032495b242b2cb9f15e21843ac1bd63cf2` |
| Backend/workers | `37c13db`, implantação e QA em `demucs-fila-revisoes-20261009.md` |

A validação local do archive confirmou bundle `com.maislouvor.app`, versão/build,
AppIcon, criptografia não isenta desativada e 225 arquivos web idênticos à fonte
sincronizada. A exportação não restringe o binário a testes internos.

As capturas usam a fonte visual `9657164`; o único diff para `94b9a93` é o
esclarecimento da política de privacidade e seu teste, sem alterar as telas
fotografadas. Não há captura da política antiga apresentada como atual.
O mixer do iPad foi excluído da ficha porque uma URL longa de atribuição era
cortada na área central. A imagem original permanece como evidência de QA.

## Alterações entregues e validação

No iOS atualizado, ações YouTube abrem o aplicativo externo ou Safari. Os guards
impedem os embeds/iframe API nos caminhos nativos auditados; web e Android antigo
continuam com o comportamento anterior descrito pela política. Áudio enviado,
mixer, separação e Asafe permanecem. O helper compilado e o bridge Capacitor
8.5.2 foram exercitados em harness: Safari abriu, não houve iframe e o retorno
ao app funcionou. Não representa teste de todas as telas em iPhone físico.

O QA da demo fictícia confirmou login, repertórios, letras/cifras, culto/escala
e reprodução/pausa das cinco faixas nos simuladores de iPhone e iPad. Nenhum
usuário real recebeu consentimento ou alterações para preparar as imagens.

A fila de separação agora valida permissão/consentimento, identifica a revisão
da fonte e impede finalizações antigas de substituírem resultados novos.
CPU do VPS e GPU local foram atualizados após backup e drenagem. O teste real
isolado percorreu Edge → fila → GPU → seis faixas em onze segundos, com downloads
autenticados. A fixture e seus treze arquivos foram removidos; a demo Apple
permaneceu intacta. A qualidade sonora da separação não foi medida pelo sinal
sintético. Uma segunda GPU externa ainda precisa atualizar para receber jobs;
o protocolo antigo não recebe novos trabalhos, e CPU/GPU local mantêm o serviço.

A web recebeu upload/corte com caminhos novos e controle de revisão, além da
política. Publicação às 20:24:13 UTC: 224 arquivos comparados, 141 assets HTTPS
e sete rotas conferidas. Marketing, APKs e assets anteriores foram preservados.
Esses ajustes de gestão de áudio são web-only e não exigem incluí-los no iOS 11.

Verificações: suíte web final **563 testes / 66 arquivos**, SQL **56**, Python
dos workers **25**, handlers Deno **6**. A suíte anterior ao ajuste web passou
557 testes; uma falha por timeout durante a compilação Xcode foi reexecutada
isoladamente e depois na suíte completa com dois workers, ambas aprovadas.

## O que ainda impede declarar pronto para revisão

1. **Compras Apple:** catálogo, compra, restauração e liberação do plano ainda
   não validados. O erro anterior brasileiro é `ML-IOS-OFFERINGS-23-BRA`.
   O teste StoreKit direto no simulador USA retornou zero produtos para 66 IDs
   (SK1 marcou os 66 inválidos), sem erro nativo SK2. Isso não prova a causa no
   iPhone brasileiro. Não há correção confirmada nem solicitação de logout da
   conta pessoal. Materiais de revisão dos produtos dependem desse fluxo real.
2. **Direitos do conteúdo:** a base de autorização dos conteúdos e fontes
   continua sem comprovação geral. Isso não significa uma obrigação universal
   de anexar uma carta para cada upload antes de submeter um app com conteúdo
   dos usuários. A apresentação deve explicar o modelo real, a moderação e
   os usos; a Apple pode exigir comprovantes pelas regras 5.2.2/5.2.3. Não foi
   marcada declaração de direitos sem suporte. Importação somente na web não
   autoriza extração do YouTube ou reprodução no app. A demo licenciada não
   comprova direitos sobre os arquivos de terceiros.
3. **Acesso de revisão ao Asafe:** grupo de teste conectado à demo a pedido
   expresso do responsável em 09/10. Avisos desligados, somente ativação
   administrativa da fixture registrada, sem consentimentos pessoais. O
   revisor/testador ainda deve vincular seu WhatsApp e validar uma conversa
   real; as instruções e o convite foram salvos nas notas privadas da Apple.
   Ver [registro do grupo](asafe-grupo-revisao-20261009.md).

Pendências operacionais registradas, sem alegar resolução: prova da retenção/
rotação de logs conforme a política, atualização da segunda GPU e reconciliação
segura futura de arquivos órfãos. Nenhum dump ou segredo foi incluído no Git.

## Referências

- [Notas salvas na ficha](notas-revisao.md)
- [Matriz de privacidade](app-privacy-final-20261009.md)
- [Diagnóstico de compras](diagnostico-nativo-assinaturas-20261009.md)
- [Separação, implantação e recuperação](demucs-fila-revisoes-20261009.md)
- [Modelo de autorização musical](modelo-solicitacao-autorizacao-musical.md)
