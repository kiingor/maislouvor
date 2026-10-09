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

Preparando o build 9 com mensagem segura por etapa e código de suporte para obter o erro no aparelho brasileiro, preservando preços e catálogo. Disponibilidade, validações finais e resultado no aparelho ainda pendentes neste registro inicial.
