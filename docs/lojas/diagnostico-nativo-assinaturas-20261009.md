# Diagnóstico nativo das assinaturas — 8 de outubro de 2026

Após instalar o TestFlight 1.0.0 (8), o responsável ainda informou erro ao carregar planos e pediu teste no simulador.

## Estado atual confirmado

- App Store Connect, Negócios: acordo de apps pagos **Ativo**, conta bancária **Ativa** e três formulários fiscais **Ativo**. Substitui a pendência comercial registrada na publicação do build 8. Nenhum aceite ou declaração foi feito pelo agente.
- Apple Developer: bundle explícito `com.maislouvor.app`, capacidade **In-App Purchase habilitada**.
- Assinatura representativa `com.maislouvor.app.asafe.10.monthly`: preço vigente **R$ 26,90**, Brasil, duração mensal, nome e descrição pt-BR preenchidos. A interface mostra **Preparar para envio**. Captura para revisão ainda ausente; não foi tratada como causa comprovada da falha no sandbox.
- Catálogo Apple restrito ao Brasil. O responsável confirmou que Mídia e Compras do iPhone usa Brasil.

## Teste efetivamente executado

Aplicativo de diagnóstico isolado, compilado no NVMe, instalado no simulador iPhone 17 Pro Max QA, iOS 27. Mesmo bundle, SDK Purchases Capacitor 13.7.0 e chave pública usados pelo build 8. Consultas ao catálogo real, sem arquivo StoreKit local, produtos fictícios, compra ou concessão de acesso.

1. Plataforma iOS nativa, plugin Purchases presente.
2. Configuração do SDK concluída; identidade opaca corresponde ao cliente esperado, sem registrar o identificador aqui.
3. `getCustomerInfo()` concluiu, sem entitlement ativo.
4. `getOfferings()` falhou com código **23**, informando que nenhum produto cadastrado foi obtido do App Store Connect.
5. `getProducts()` para três IDs reais habilitados concluiu com lista vazia.
6. `getStorefront()` identificou **USA** no simulador.

Isso localiza a falha observada no simulador na obtenção dos produtos Apple. **Não prova a causa no iPhone brasileiro**, porque o storefront difere. Não alteramos países de venda para contornar o teste. Evidências locais privadas em `tmp/revenuecat-simulador-catalogo-vazio.png` e `tmp/revenuecat-simulador-storefront-usa.png`. Staging isolado em `/Volumes/MaisLouvorBuild/Billing-Diagnostic-20261009` contém configuração privada e não deve ser versionado.

## Limites e próximo teste

A ativação comercial é recente, mas propagação ainda é uma hipótese. A [Apple TN3186](https://developer.apple.com/documentation/technotes/tn3186-troubleshooting-in-app-purchases-availability-in-the-sandbox) informa que sandbox não exige submissão à revisão e que alterações de metadados podem demorar até uma hora. Essa referência não comprova um prazo específico para a ativação do contrato nem garante correção automática.

## Implementação e validação do build 9

Fonte final **26013cc63ee49b786843f863270864d9768615db**, com os commits 07fc1a3 e dd0ac62. Falhas nativas agora distinguem contexto da equipe, carregamento/configuração do SDK, ofertas e consulta de compras. A tela mantém Recarregar planos e mostra somente mensagem fixa e código de suporte com etapa, plataforma, código permitido e, quando disponível, país da loja. Sem mensagens brutas, identidades, credenciais ou telemetria nova. A consulta diagnóstica do país só ocorre após falha nas ofertas e tem limite de 1,2 segundo; não altera disponibilidade territorial nem permite compra.

Assinatura ativa retornada pelo SDK também bloqueia uma segunda compra quando ainda não há entitlement correspondente. As mensagens de negócio (por exemplo, preço alterado) e o fluxo web foram preservados. Não houve mudança de preço, catálogo ou autorização de acesso.

- 54 testes direcionados e typecheck aprovados. Suíte final: **61 arquivos, 525 testes aprovados**. Um teste de Presentation excedeu o tempo sob builds concorrentes; o arquivo passou isoladamente (12 testes), depois toda a suíte passou sem concorrência de compilação. Não alteramos testes ou limites de tempo para contornar isso.
- Build para lojas e trava legal aprovados. Archive final assinado **1.0.0 (9)** no NVMe; assinatura validada, 222 arquivos web conferidos por hash no aplicativo, Purchases presente, logs da bridge desativados, sem URL remota. A chave pública corresponde à versão anterior e a identidade privada do diagnóstico não está no binário.
- Nova execução do diagnóstico isolado, usando o mesmo módulo de erros da fonte final, exibiu **ML-IOS-OFFERINGS-23-USA** a partir da falha real do SDK. Evidência: `tmp/revenuecat-simulador-codigo-suporte.png`. É uma tela de diagnóstico, não a tela autenticada do aplicativo nem uma compra.
- Web publicada às **22:20:27 BRT de 08/10**, release `20261009-billing-diagnostics-v2`; [validação e recuperação](publicacao-diagnostico-assinaturas-20261009.md). Marketing, downloads e demais serviços preservados.

Archive: `/Volumes/MaisLouvorBuild/Archives/MaisLouvor-1.0.0-9.xcarchive`. Fonte, logs, resultado dos testes e `validation.json`: `/Volumes/MaisLouvorBuild/Release-1.0.0-9`. Archive preliminar não enviado preservado como `MaisLouvor-1.0.0-9-preflight.xcarchive`.

Upload interno concluído às **22:24:12 BRT de 08/10**, `EXPORT SUCCEEDED`. **1.0.0 (9) disponível às 22:28 BRT**, status **Em testes**, grupo **Teste iPhone** com um tester existente. Instruções de teste gravadas e grupo associado, sem novos convites. Compilação Apple `e0e7c4a1-80e3-49d1-8d03-5885a89c67f6`. Confirmação local: `tmp/testflight-build9-em-testes.png`.

Solicitado ao responsável atualizar para o build 9, abrir Assinatura → Recarregar planos e informar o código de suporte caso continue falhando. Ainda falta o resultado da consulta no iPhone brasileiro e a compra/restauração. Esta melhoria torna a falha diagnosticável; **não é evidência de que a oferta ou a compra já funciona no aparelho**.

## Feedback real do build 9 — 08/10, 22:37 BRT

O feedback com captura enviado pelo TestFlight foi aberto no App Store Connect e a imagem original foi lida. Confirmados **1.0.0 (9)**, iPhone 17 Pro Max, iOS 27.0.1 e código **ML-IOS-OFFERINGS-23-BRA**. O storefront brasileiro está confirmado pelo SDK no aparelho; a divergência USA do simulador não explica esse resultado. O erro ocorre na consulta das ofertas, depois da obtenção do contexto da equipe e da configuração do SDK. Não é um relatório de encerramento inesperado do aplicativo.

Auditoria somente de leitura no RevenueCat:

- Resposta pública utilizada pelo SDK: HTTP 200, oferta atual `default`, 66 pacotes e 66 IDs únicos, exatamente os produtos Apple habilitados do manifesto local. A chave corresponde à embarcada no archive 9.
- Os 66 vínculos pacote → produto foram consultados individualmente via API V2: produto Apple esperado, app correto, elegibilidade `all`, sem divergências ou paginação pendente.
- A interface Apple mostra 70 produtos no grupo, localização pt-BR do grupo preenchida e produto mensal representativo com ID, preço, duração, disponibilidade e localização coerentes. A comparação integral dos IDs Apple usa o catálogo local; não se inspecionaram todos os metadados dos 70 produtos nesta etapa.

A consulta de identificadores no RevenueCat está válida. A falha é compatível com a obtenção dos produtos pela Apple/StoreKit, mas o código isolado não determina qual condição do catálogo a provoca. Não há evidência para alterar chaves, preços de assinaturas, territórios das assinaturas ou enviar outro binário.

### Pendência independente de cadastro corrigida

O aplicativo principal ainda mostrava **Configurar disponibilidade** e **Adicionar preços**, sem cadastro inicial. Foi salva a disponibilidade **somente Brasil**, status **Disponível no lançamento do app**, e preço de download **R$ 0,00**, com Brasil como referência. A Apple calcula a tabela de preços para 175 regiões, mas a disponibilidade continua limitada a uma região. Não houve submissão à revisão, lançamento público, compra, convite ou alteração no preço das assinaturas.

Confirmações locais: `tmp/app-brasil-disponivel-lancamento.png` e `tmp/app-preco-gratuito-brasil.png`. O preço do app é requisito de preparação para submissão, mas a [TN3186](https://developer.apple.com/documentation/technotes/tn3186-troubleshooting-in-app-purchases-availability-in-the-sandbox) não o lista como requisito explícito do sandbox. **Essa correção não comprova a causa nem a solução do erro 23.**

Solicitado um novo teste na mesma versão 9, fechando e reabrindo o app e usando Assinatura → Recarregar planos, sem realizar compra. A disponibilidade efetiva dos produtos no iPhone e a compra/restauração continuam sem confirmação. Nenhuma mudança de código ou publicação adicional foi feita nesta investigação.

## Captura USB do iPhone — 08/10, após 23:07 BRT

Novo feedback do TestFlight às 23:07 BRT manteve **ML-IOS-OFFERINGS-23-BRA**, na mesma versão 9. O responsável conectou e autorizou o iPhone e reproduziu a falha. Foi instalado `libimobiledevice` pelo Homebrew, dentro da autorização existente para ferramentas de diagnóstico. Capturas limitadas ao processo do app e, em seguida, aos serviços de compras com filtro do bundle; encerradas após o teste. Arquivos locais privados em `/private/tmp/maislouvor-iphone-native.log` e `/private/tmp/maislouvor-iphone-storekitd.log`, com permissão 0600, sem inclusão no repositório ou no BrainHub.

- O log do app contém 11 consultas `Products_SK2`, seguidas do erro de configuração do RevenueCat. A mensagem de produtos não encontrados é do SDK, e **não uma resposta literal da Apple**. O código instalado em `OfferingsManager.swift` converte tanto lista vazia quanto falhas de consulta que não sejam timeout nessa mensagem. Não há comprovação de HTTP 200 com resposta vazia no iPhone.
- O serviço de compras identifica explicitamente `com.maislouvor.app (+Louvor) Testflight` e utiliza o endpoint sandbox `amp-api.sandbox.apple.com/v1/catalog/us/in-app-purchasables`. São 96 ocorrências do caminho `/catalog/us/`, nenhuma de `/catalog/br/`, apesar do storefront BRA informado pelo SDK. As ocorrências incluem repetição dos mesmos eventos e não representam 96 requisições independentes.
- O aviso `AMSErrorDomain 204` observado refere-se a uma consulta de configuração que o próprio log declara sem impacto funcional. Não foi tratado como causa da falha. O filtro por bundle pode excluir mensagens de transporte sem esse identificador; portanto a captura não determina integralmente a resposta HTTP.

A divergência de catálogo é uma hipótese a testar, **não uma causa confirmada**. A [documentação do RevenueCat sobre moeda no TestFlight](https://www.revenuecat.com/docs/test-and-launch/sandbox/apple-app-store#currency) registra que metadados podem vir em USD mesmo com outra região, e ainda assim a compra funcionar. Não se ampliaram países de venda, alteraram preços ou publicaram novos binários para contornar essa hipótese.

### Próximo teste controlado

A lista de contas Sandbox no App Store Connect estava vazia. Foi preparado o formulário de novo tester com região Brasil e o e-mail fornecido pelo responsável. Ele definiu a senha e concluiu o cadastro diretamente no Safari; a interface confirmou **uma conta Sandbox, Brasil**, sem compra. Não registrar e-mail ou senha neste documento.

Solicitado ao responsável seguir o [procedimento Apple para TestFlight e Sandbox](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testing-subscriptions-and-in-app-purchases-in-testflight/): habilitar Modo de Desenvolvedor, sair somente de Mídia e Compras e entrar na conta Sandbox nos ajustes de Desenvolvedor. Informado o efeito temporário sobre conteúdos comprados e que o login do +Louvor e o iCloud permanecem conectados. A configuração no aparelho ainda não foi confirmada. Verificar a região e repetir uma consulta com captura limitada antes de concluir que houve correção. Compra/restauração ainda pendentes. Nenhuma compra, concessão de plano pago, submissão pública ou nova publicação ocorreu nesta etapa.
