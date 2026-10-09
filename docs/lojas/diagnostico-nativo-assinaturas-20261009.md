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
