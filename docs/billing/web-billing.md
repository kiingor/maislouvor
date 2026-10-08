# Assinaturas Web — 07/10/2026

**Atualização de 07/10/2026: backend, webhook e app Web publicados.** As seis equipes anteriores continuam ilimitadas; novas equipes têm cinco vagas gratuitas. Veja [a implantação e a validação final](web-release-20261007.md). As referências a “local” e “pendente” abaixo descrevem a preparação anterior.

Implementação local com **RevenueCat Web SDK + Stripe Billing**, ainda não publicada. Em 07/10, após Filipe confirmar o e-mail e autorizar explicitamente a conta **Flow3D**, o app oficial RevenueCat foi instalado na Stripe e a conexão foi concluída. O provedor `+Louvor (Stripe)` foi criado no projeto e conferido pela API: `appf29f8b5c76`, tipo `stripe`, conta `acct_1SgaIrQkzdQuLYm9`. Managed Payments permanece desativado.

As chaves públicas Web, a chave de servidor RevenueCat v1 e a v2 limitada à leitura de assinaturas foram guardadas fora do repositório, em arquivos privados. A verificação por e-mail da Stripe foi concluída; a chave restrita `MaisLouvor Web Billing` foi obtida e validada contra a conta correta. Permissões: escrita em Products, Prices e Customer Portal; leitura em Subscriptions e Accounts. O endpoint RevenueCat de assinaturas aceitou a autenticação v2 e retornou `404 resource_missing` para um cliente inexistente, sem criar compra. Segredo de webhook e configuração de backend estão preparados localmente, ainda não instalados.

O cadastro de **produção** foi concluído e conferido: 70 produtos/preços BRL na Stripe, 70 produtos RevenueCat associados aos quatro entitlements e aos packages da Offering `web`, além de nove configurações do portal (uma geral e oito de ampliação). Portal geral: `bpc_1UNuqcQkzdQuLYm9EBqtuxgp`. O SDK com a chave de produção retornou todos os 70 valores, moedas, períodos e identificadores esperados. A Offering atual da Apple foi preservada. O retorno de gerenciamento no provedor aponta para `https://maislouvor.com/app/settings`. O nome público foi definido como `+Louvor`; a aparência de produção recebeu fundo `#F5F5F5`, botões `#1C1B17`, cards brancos e cantos Rounded, a partir dos tokens atuais do app. O Liquid Glass permanece na tela própria; o formulário de cartão usa os componentes hospedados da Stripe.

O primeiro checkout com a chave sandbox do provedor de produção retornou 8142: os logs Stripe confirmaram preço live solicitado com chave test. Foi conectado um **Stripe Sandbox isolado**, `acct_1SgaJ4HcP5k43uTa`, e criado o provedor dedicado `+Louvor Web (Sandbox)`, `appee42ea3fa5`, conforme a documentação oficial. Não usar a chave sandbox do provedor principal para testar preços live. O script agora confere também se o app RevenueCat está conectado à mesma conta da chave Stripe antes de cadastrar produtos. O catálogo sandbox foi concluído: outros 70 produtos/preços e nove configurações de portal, associados à mesma Offering `web` por app. Portal geral sandbox: `bpc_1UNv2VHcP5k43uTaEi8rnjVJ`. Manifesto/SQL em `tmp/billing-web-setup.local/sandbox/`; não aplicar esse SQL no backend de produção.

Foram concluídas duas compras **exclusivamente sandbox**, com cartão oficial de teste Stripe: Essencial 10 mensal (R$ 16,90) e anual (R$ 169,00). Ambas retornaram sucesso no SDK e entitlement Essencial ativo. As APIs v1/v2 confirmaram a origem Stripe, o ambiente sandbox e o identificador de item `si_` esperado pelo portal. A projeção real do backend reconheceu os dois contratos em SANDBOX e rejeitou ambos em PRODUCTION. Isso ainda não é validação do webhook ou da liberação de vagas em banco: funções e migrações não foram publicadas. A área Stripe de testes exibe uma tarefa antiga de representante e capabilities inativas; isso não impediu as duas compras simuladas e não foi alterado por esta sessão.

Nenhuma cobrança real, deploy ou migração de produção foi realizado nesta etapa. O ambiente público do app e as contas dos usuários permanecem sem alteração por esta integração.

## Fluxo implementado

- O responsável escolhe o plano, integrantes e mensal/anual na tela existente, com botão flutuante, Voltar e Liquid Glass. A Web pode selecionar a Offering `web` sem modificar a Offering atual da Apple.
- Checkout Web em português pelo `@revenuecat/purchases-js` já instalado e fixado em 1.68.0. O SDK coleta os dados de pagamento; nenhum cartão passa pelo banco do +Louvor. Ao concluir, a confirmação continua dependendo da consulta do servidor ao RevenueCat.
- A assinatura pertence à mesma identidade opaca da equipe em todas as plataformas. Compras ativas, inclusive ainda sem entitlement, impedem outro checkout.
- Aumentar vagas de uma assinatura Stripe abre um `subscription_update_confirm` no Customer Portal. O endpoint identifica o **item Stripe `si_`** pelo subscriber da equipe no RevenueCat v2 e consulta a assinatura e preço na Stripe. Nunca aceita customer/subscription/return URL enviados pelo navegador.
- Somente proprietário pode abrir o portal. Ampliação exige contrato ativo, mesmo plano e período, capacidade maior e suficiente, moeda BRL e preço exatamente igual ao exibido. Assinaturas com pendência, cancelamento agendado, múltiplos itens ou alteração já agendada precisam de resolução no gerenciamento.
- O portal mostra a cobrança proporcional, permite confirmação/autenticação de pagamento e atualiza o item existente. Abrir uma sessão não concede vagas nem é informado como compra concluída. A API beta de mudança de produto do RevenueCat não é usada: sua documentação informa fallback para uma nova assinatura quando falta uma rota de mudança.
- O portal geral permite consultar faturas, atualizar pagamento e cancelar ao final do período. Troca de plano/período e redução não são executadas por este endpoint de ampliação; exigem suporte por enquanto. As configurações de ampliação têm no máximo nove produtos, respeitando o limite de dez do portal Stripe.
- Retorno à aba Assinatura com `billing=return&billing_team=<uuid>` dispara sincronização apenas da equipe correspondente. A URL nunca comprova pagamento. Falha de sincronização permanece recuperável pelo botão Atualizar.
- Renovação Stripe: quando o vencimento local passou mas ainda havia entitlements, o servidor consulta RevenueCat antes de negar vagas. Esse passo existe na consulta de capacidade para líderes e na geração/aceitação de convite já autorizadas. Erro de rede permite tentar novamente, sem converter o contrato em gratuito. Gratuitos, ilimitados, Apple e contratos já expirados confirmados não passam por essa atualização.
- As regras anteriores permanecem: novos times Essencial até cinco; existentes ilimitados; vínculo e visualização no admin pelo mesmo registro de assinatura. Nenhuma outra migração de contas foi adicionada.

## Cadastro reproduzível

`scripts/setup-web-billing.mjs` usa os 70 preços de `revenuecat-catalog.json`, incluindo os quatro anuais que a Apple não aceita. São 35 mensais e 35 anuais, com o anual de dez mensalidades em uma cobrança. Não existe SKU pago para Essencial até cinco.

Sem argumentos, só valida e imprime a prévia, sem acessar APIs:

```sh
node scripts/setup-web-billing.mjs
```

Depois de conectar a Stripe e criar a configuração Stripe Billing no RevenueCat, carregar as variáveis por um canal local seguro. Nunca colocar secrets em `VITE_*` nem nos argumentos do comando:

- `STRIPE_SECRET_KEY`: chave da conta no ambiente escolhido; backend precisa ler subscription items, subscriptions e prices, além de criar sessões do portal. Cadastro precisa criar produtos/preços/configurações.
- `STRIPE_ACCOUNT_ID`: conta Stripe conferida no painel, para evitar cadastrar em outra conta.
- `REVENUECAT_CATALOG_API_KEY`: API v2, permissões de configuração para apps (leitura), products, entitlements, offerings e packages. Somente no processo de cadastro.
- `REVENUECAT_PROJECT_ID`: projeto correto, atualmente `proj230d06a6`.
- `REVENUECAT_WEB_APP_ID`: ID real da configuração Stripe Billing criada no ambiente escolhido.
- `BILLING_WEB_RETURN_URL`: URL HTTPS real do aplicativo terminando em `/app/settings`; não é tomada do navegador.

```sh
# Sandbox é o padrão; exige uma chave Stripe test.
node scripts/setup-web-billing.mjs --apply
# Produção exige escolha explícita e uma chave Stripe live.
node scripts/setup-web-billing.mjs --apply --production
```

O script compara preços, moeda, período e ambiente; reusa SKUs/lookup keys/metadados e chaves de idempotência. Divergência interrompe a execução. Não troca preços existentes automaticamente, não cria clientes/assinaturas e não faz cobranças. Depois da leitura de retorno, escreve manifesto e SQL em `tmp/billing-web-setup.local/<ambiente>/`, ignorado pelo Git. O SQL usa os identificadores **realmente retornados** por RevenueCat (produto ou preço, conforme o modelo do projeto), sem supor que o ID Apple sirva para Stripe. A Offering atual da Apple não é alterada.

O cadastro externo de produção já foi executado e verificado nas APIs e pelo SDK. Manifesto e SQL correspondentes estão em `tmp/billing-web-setup.local/production/`. O SQL gerado ainda não foi aplicado ao backend.

## Ativação pendente

1. Conexão de produção, chaves e catálogo concluídos. Para homologação, usar o provedor dedicado de sandbox acima e seu próprio catálogo; nunca misturar IDs de preço live com a chave test.
2. Compras sandbox mensal/anual e projeção de servidor já passaram. Concluir os cenários restantes descritos no item 7. Conferir atendimento e URLs legais reais antes da publicação. Não preencher dados bancários/jurídicos por suposição.
3. No backend correspondente, aplicar somente as migrações revisadas de billing/limites e `20261007130000_stripe_billing_catalog.sql`; aplicar o `catalog.sql` gerado. A nova tabela é privada, sem grants para anon/authenticated. Não usar `db push` indiscriminadamente: este checkout tem outros trabalhos.
4. Configurar `REVENUECAT_SECRET_API_KEY` v1, `REVENUECAT_V2_SECRET_API_KEY` com `customer_information:subscriptions:read`, `REVENUECAT_PROJECT_ID`, `REVENUECAT_ENVIRONMENT`, `STRIPE_SECRET_KEY`, `STRIPE_PORTAL_CONFIGURATION_ID` geral retornado pelo script, `BILLING_WEB_RETURN_URL` e o segredo do webhook.
5. Publicar `revenuecat-sync`, `revenuecat-webhook`, `revenuecat-web-portal`, `create-invite` e `accept-invite` após as migrações. Manter o webhook autenticado e os filtros de ambiente. Confirmar o destino auto-hospedado do backend antes de publicar.
6. Build Web com chave pública **da configuração Stripe**, `VITE_REVENUECAT_WEB_API_KEY`, e `VITE_REVENUECAT_WEB_OFFERING_ID=web`. Habilitar o portal geral e configurar seu endereço no provedor RevenueCat para o gerenciamento da origem em outras plataformas. Registrar o domínio na Stripe se for usar Apple Pay/Google Pay. Não foi presumida disponibilidade de Pix/boleto.
7. Homologar compra mensal/anual, pagamento recusado/3DS, ampliação com cobrança proporcional, renovação, cancelamento, expiração, webhook, retorno com várias equipes e painel admin. As vagas só podem aumentar depois de confirmação do backend. O catálogo de produção já existe; após a homologação, aplicar sua configuração ao backend e publicar.

## Validação desta etapa

- 73 testes Vitest de billing/convite/admin, incluindo cinco de API e sete novos de SDK/React; 35 testes Deno de webhook/sync/portal; três testes locais de cadastro.
- Banco isolado PGlite: 52 verificações RevenueCat (incluindo RLS/grants do mapa Stripe) e 57 de preservação/limites.
- TypeScript, ESLint dos módulos billing e build passaram. A verificação ampliada de `TeamSettings.tsx` encontrou 11 erros de `any` e um aviso de dependência de hook em código preexistente, fora da linha de retorno adicionada nesta etapa.
- UI Web: 137 verificações em cada engine, Chromium e WebKit, em 320/390/440/1440 px, com transporte/checkout/portal simulados. Inclui retorno, não liberação ao abrir portal e preservação de ilimitados. Captura móvel revisada em `/tmp/maislouvor-web-billing-qa/billing-expand-390.png`. WebKit usa o binário local `webkit-2359/pw_run.sh` via `BILLING_QA_EXECUTABLE`.
- Leitura do catálogo com SDK 1.68.0 de produção: 70/70 preços, BRL, períodos P1M/P1Y e identificadores conferidos contra o manifesto. Os três testes locais do script passaram após acrescentar a conferência de conta Stripe.
- Sandbox isolado: 70/70 produtos conferidos pelo SDK; compras mensal e anual concluídas com cartão de teste, retornando Essencial ativo. Chaves backend v1/v2 validadas com as assinaturas; projeção de servidor confirma datas e isolamento de ambientes. Clientes de teste: `maislouvor-billing-qa-monthly-20261007` e `maislouvor-billing-qa-annual-20261007`. Nenhuma cobrança real ou alteração nas equipes do aplicativo.
- Formulário hospedado Stripe em português conferido em 390 px: largura interna e scrollWidth de 390, sem overflow horizontal. Captura local em `tmp/billing-web-setup.local/isolated-sandbox-checkout-mobile.png`. A prévia de teste usa a aparência de sandbox; as cores neutras de produção foram salvas e conferidas no editor RevenueCat.
- Nenhuma alteração foi enviada para lojas ou para o checkout paralelo `MaisLouvor-lojas`.

Referências oficiais: [Stripe Billing no RevenueCat](https://www.revenuecat.com/docs/web/integrations/stripe), [mudanças de produto Web em beta](https://www.revenuecat.com/docs/web/product-changes), [confirmação no Customer Portal](https://docs.stripe.com/customer-management/portal-deep-links), [configuração do portal](https://docs.stripe.com/api/customer_portal/configurations/create), [identificadores de assinatura RevenueCat](https://www.revenuecat.com/docs/api-v2/subscription).
