# Assinaturas da equipe com RevenueCat

Implementação local de 06/10/2026. O fluxo fica em **Usuário → Assinatura** (`/app/settings`). Integração preparada para Web, iOS e Android; a ativação depende do catálogo, das credenciais e da publicação do backend. Nenhuma cobrança real foi executada nesta implementação.

**Web em 07/10:** implementação ampliada com Stripe Billing, portal autorizado por equipe, confirmação de mais vagas e reconciliação no retorno. Conexão Stripe/RevenueCat, catálogo externo e ativação continuam pendentes. Veja [implementação, cadastro e ativação Web](billing/web-billing.md); essa atualização prevalece sobre as instruções genéricas de Web abaixo.

## Configuração externa verificada em 06/10/2026

- Criado o app **+Louvor (App Store)** no projeto RevenueCat **+Louvor**, com bundle `com.maislouvor.app`.
- Criada a credencial de compras dentro do app na Apple e enviada ao RevenueCat. O painel confirmou **Valid credentials**. A cópia local do arquivo privado permanece fora do repositório, com acesso restrito ao usuário.
- Chave pública Apple configurada em `VITE_REVENUECAT_IOS_API_KEY` no `.env.local` ignorado pelo Git deste checkout. Ela ainda precisa estar presente no ambiente que compila o app nativo; o checkout paralelo de lojas não foi alterado.
- URLs de notificações da Apple, em produção e sandbox, apontam para o endpoint fornecido pelo RevenueCat. A persistência das duas URLs foi conferida após recarregar o App Store Connect. Ainda não houve transação para validar a entrega de eventos.
- Restauração configurada como **Keep with original App User ID**, sem comportamento diferente para sandbox. Persistência conferida após recarregar o painel.
- O painel RevenueCat ainda solicita a confirmação do e-mail da conta. Os apps Web/Google, os secrets do backend, a publicação das funções e a compra sandbox continuam pendentes. A chave secreta existente no painel é da API v2; a integração do servidor descrita abaixo usa a API v1. Nenhuma chave secreta foi colocada no frontend.

### Catálogo aprovado em 06/10/2026

- App Store Connect: grupo **MaisLouvor - Planos por equipe** (`22449162`), com 70 produtos, localização pt-BR e períodos mensal/anual. 66 têm preço exato da tabela aprovada e disponibilidade somente no Brasil; quatro anuais acima do limite da conta permanecem sem oferta. Nenhuma assinatura foi enviada para revisão.
- RevenueCat: 70 produtos no app Apple, entitlements `essencial`, `estudio`, `asafe` e `completo`, Offering `default` atual e 66 packages associados aos produtos. Cada produto está ligado ao entitlement do seu plano.
- Conferência por leitura de retorno: 70 produtos/localizações/períodos, 66 preços exatos em BRL e quatro rascunhos sem preço na Apple; 70 produtos/entitlements e 66 packages no RevenueCat, com Offering atual. IDs e estado de revisão em [catalog-verification.json](billing/catalog-verification.json).
- Tabela e regras: [preços e ampliação da equipe](billing/apple-price-differences.md). Manifesto de IDs: [revenuecat-catalog.json](billing/revenuecat-catalog.json). O Essencial até cinco integrantes é gratuito e não gera produto pago.
- `supabase/setup/revenuecat_catalog.sql` registra os 70 IDs reais e habilita somente as 66 opções com preço; é idempotente e preserva produtos anteriores. A aplicação no ambiente real ainda está pendente.

A chave da **Test Store** serve para desenvolvimento e não deve ser usada em builds Release/TestFlight. TestFlight usa a chave pública do app Apple com as compras sandbox da Apple. Referências: [Test Store](https://www.revenuecat.com/docs/test-and-launch/sandbox/test-store), [credencial de compras da Apple](https://www.revenuecat.com/docs/service-credentials/itunesconnect-app-specific-shared-secret/in-app-purchase-key-configuration) e [notificações da Apple](https://www.revenuecat.com/docs/platform-resources/server-notifications/apple-server-notifications).

## Modelo e comportamento

- A assinatura pertence à **equipe**. Somente `teams.owner_id` pode comprar, restaurar e gerenciar; o papel `admin` da equipe, sozinho, não concede acesso à cobrança.
- O servidor cria um UUID opaco por equipe em `revenuecat_customers`. Esse é o App User ID do SDK nas três plataformas. Não usar e-mail, UUID do usuário, `team_id` ou atributos editáveis pelo cliente como vínculo de cobrança.
- Membros consultam o plano pelo RPC autorizado `get_team_billing_context`, sem receber a identidade de cobrança nem observações administrativas. Novos membros veem a mesma assinatura da equipe.
- O catálogo local associa os produtos reais aos planos **Essencial, Estúdio, Asafe e Completo**, ao entitlement, ao limite de integrantes e ao período mensal/anual. Preços e moeda vêm dos SDKs; a proposta da landing não é usada como preço de checkout.
- A UI mostra apenas produtos da Offering selecionada, habilitados no catálogo, com período correspondente ao SDK e capacidade suficiente para a equipe. Antes de comprar, testa a sincronização do backend e revalida proprietário, integrantes, produto, preço e ausência de outra assinatura ativa. Backend indisponível ou sem secrets impede iniciar uma cobrança.
- iOS/Android usam `@revenuecat/purchases-capacitor`; Web usa `@revenuecat/purchases-js`. Não existe fallback de checkout Web dentro do app nativo. Compras e restaurações são ações explícitas.
- A confirmação é feita pelo servidor consultando a API REST v1. Payload de compra do navegador, atributos e eventos não podem conceder plano diretamente.
- Cancelamento da renovação mantém acesso até o fim do período pago. Carência mantém acesso enquanto válida. Expiração e reembolso revogam acesso. O RPC recalcula o vencimento a cada leitura, inclusive se o webhook estiver atrasado.
- Webhooks autenticados reconciliam o estado atual, registram IDs processados e toleram novas tentativas. Eventos antigos não sobrepõem snapshots mais recentes. Transferências reconciliam os dois lados conhecidos.
- Compra ou ampliação concluída com falha de sincronização mostra confirmação pendente e bloqueia outra compra. A confirmação exige que o backend retorne exatamente o novo produto, mesmo quando a assinatura anterior continua ativa. `Atualizar` e o webhook recuperam o estado. Uma falha da API não transforma a equipe em gratuita.
- Contratos manuais existentes permanecem preservados em consultas vazias. A UI não oferece nova contratação sobre um contrato manual pago ou outro gateway. Assinaturas RevenueCat aparecem no gerenciador como somente leitura.

## Tela de montar o plano

Em Usuário → Assinatura, o responsável escolhe integrantes, período e um dos quatro planos. O seletor aceita `+1`, `−1` e digitação, sem ficar abaixo da quantidade atual da equipe. A tela mostra os preços do SDK, capacidade efetivamente incluída e total por mês/ano. Vagas ainda disponíveis não geram alteração paga; quando esgotadas, é oferecida a próxima faixa do plano com a diferença de preço.

Os quatro anuais desabilitados não ganham preço alternativo nem fallback mensal silencioso. Combinações sem produto retornado pela loja ficam indisponíveis. Equipes acima de 200 recebem orientação para suporte. A revisão de 07/10 implementa o bloqueio de novos integrantes no servidor e preserva as equipes existentes como ilimitadas; veja [a política e a ordem de ativação](billing/member-limits.md).

## Configuração do catálogo

1. Criar os apps Apple e Google no projeto RevenueCat; conectar as lojas. Para Web, usar a configuração **Stripe Billing** e sua conta Stripe, conforme [o procedimento Web](billing/web-billing.md).
2. Criar os produtos de assinatura e preços definitivos em cada origem. Usar períodos mensais (`P1M`) e anuais (`P1Y`/`P12M`), com capacidade por faixa de equipe. Associar os produtos Apple a um grupo de assinaturas adequado para evitar compras simultâneas do mesmo serviço.
3. Criar os entitlements correspondentes. Os IDs podem ser diferentes dos nomes exibidos, desde que coincidam com `revenuecat_products.entitlement_id`.
4. Criar uma Offering com os packages oferecidos em cada plataforma e marcá-la como Current, ou configurar `VITE_REVENUECAT_OFFERING_ID`. Pode haver packages personalizados por plano/faixa/período.
5. Registrar **os IDs reais retornados pelo SDK e pela API REST** em `revenuecat_products`. No Google, conferir o identificador com base plan. A migração não inventa nem habilita produtos.

O seed real da Apple está em `supabase/setup/revenuecat_catalog.sql`. Para outras plataformas, adicionar os identificadores reais após cadastrar seus produtos. Exemplo ilustrativo:

```sql
INSERT INTO public.revenuecat_products
  (product_id, entitlement_id, plan, member_limit, billing_period)
VALUES
  ('SEU_ID_REAL_COMPLETO_20_MENSAL', 'completo', 'completo', 20, 'monthly'),
  ('SEU_ID_REAL_COMPLETO_20_ANUAL', 'completo', 'completo', 20, 'annual');
```

O catálogo é escrito apenas pelo operador/backend. Para retirar um produto de venda, usar `enabled = false`; não apagar produtos de assinantes existentes. Produtos desconhecidos ainda ativos fazem a sincronização falhar, preservando o registro anterior para correção e retry.

Em **Restore Behavior**, configurar **Keep with original App User ID**. A assinatura é de uma equipe; restaurar a mesma compra em outra equipe não deve transferi-la automaticamente. Transferências deliberadas precisam de procedimento de suporte. O tratamento de `TRANSFER` é defensivo; não autoriza mover assinaturas pelo app.

## Variáveis

O arquivo `.env.revenuecat.example` contém os nomes, sem credenciais.

| Variável | Local | Uso |
| --- | --- | --- |
| `VITE_REVENUECAT_IOS_API_KEY` | Build do app | Chave pública do app Apple |
| `VITE_REVENUECAT_ANDROID_API_KEY` | Build do app | Chave pública do app Google |
| `VITE_REVENUECAT_WEB_API_KEY` | Build Web | Chave pública Web; sandbox e produção têm chaves próprias |
| `VITE_REVENUECAT_OFFERING_ID` | Build, opcional | Offering específica; vazio usa Current |
| `REVENUECAT_SECRET_API_KEY` | Secrets das Edge Functions | Chave REST v1 do projeto, nunca `VITE_*` |
| `REVENUECAT_WEBHOOK_AUTHORIZATION` | Secrets das Edge Functions | Valor completo do header configurado no webhook, ex. `Bearer <segredo aleatório>` |
| `REVENUECAT_ENVIRONMENT` | Secrets das Edge Functions | `SANDBOX` ou `PRODUCTION`, obrigatório |

`SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são fornecidos pelo ambiente Supabase. Segredos não devem ser colocados no código, em arquivos versionados ou no chat.

Usar ambientes Supabase/RevenueCat separados para homologação e produção. O mesmo cliente RevenueCat pode ter compras sandbox e reais; a separação evita colisão do mesmo produto nos dados do subscriber. O servidor filtra o ambiente e impede trocar o ambiente de uma assinatura já persistida. Não mudar `REVENUECAT_ENVIRONMENT` de um banco já utilizado para testes para reaproveitá-lo como produção.

## Ativação

1. Conferir a migração administrativa já aplicada e aplicar `supabase/migrations/20261006220000_revenuecat_billing.sql` no ambiente escolhido. Ela depende de `20260930010000_platform_admin_and_support.sql`, de `teams`, `profiles`, `team_members` e `get_my_profile_id`. Revisar as migrações pendentes antes de qualquer `db push`, pois este checkout contém outros trabalhos.
2. Aplicar `supabase/setup/revenuecat_catalog.sql` e configurar os secrets pelo canal seguro do ambiente. Confirmar o host real: o backend existente é auto-hospedado, e a URL de nuvem abaixo é apenas exemplo, não o destino verificado de publicação.
3. Publicar as funções:

   ```sh
   supabase functions deploy revenuecat-sync
   supabase functions deploy revenuecat-webhook --no-verify-jwt
   ```

   O endpoint `revenuecat-sync` valida a sessão Supabase e o proprietário. O webhook não usa JWT Supabase e exige sua própria autorização.
4. Em RevenueCat → Integrations → Webhooks, configurar `https://<projeto>.supabase.co/functions/v1/revenuecat-webhook`, o mesmo header de autorização e o ambiente correspondente. Enviar todos os eventos de assinatura, incluindo transferência, cancelamento, cobrança em atraso, extensão e expiração. Validar com `TEST` e, depois, uma compra sandbox.
5. Publicar o build Web com as chaves públicas apropriadas. Sem chave da plataforma, a UI mostra que novas assinaturas estarão disponíveis em breve.
6. Integrar os arquivos ao checkout nativo quando o trabalho paralelo de lojas permitir. Preservar a configuração nativa atual; executar `npx cap sync ios`/`android` naquele checkout, compilar e testar. Este checkout não contém os projetos iOS/Android. Não foi sincronizado, assinado ou enviado novo build às lojas.

### Homologação externa ainda necessária

- Compra sandbox mensal/anual e ampliação de capacidade no iPhone, com produtos e contas de teste reais. A Apple ainda informa `MISSING_METADATA`; completar metadados de revisão e captura da tela do app antes de submeter. Google e Web exigem configuração própria de catálogo e gateway.
- Restauração na mesma equipe/dispositivo novo e recusa de restauração para outra equipe.
- Renovação, cancelamento com acesso restante, expiração, falha com carência e reembolso.
- Confirmação no webhook e no gerenciador; desligar temporariamente o backend para validar a recuperação após checkout.
- Gerenciamento/cancelamento pela URL retornada por RevenueCat para a origem da compra.
- Revisão dos textos de produto, preços, termos, política de privacidade e condições comerciais no checkout/lojas antes da oferta pública.

## Limites desta entrega

- Aplica o limite de integrantes às equipes novas, após a migração específica, na geração e aceitação de convites. As contas existentes ficam ilimitadas. Não adiciona quotas de repertórios, áudio, IA, armazenamento ou Asafe. Veja [limites de integrantes](billing/member-limits.md).
- Não calcula MRR a partir de preços de checkout ou valor anual. `monthly_amount` fica vazio em assinaturas RevenueCat para não distorcer o indicador administrativo com um valor inventado. Receitas, moedas, impostos, estornos e relatórios financeiros ficam no provedor.
- Implementa ampliação de capacidade no iOS para assinaturas Apple, mantendo o plano e o período. Os produtos compartilham um grupo e nível, permitindo substituição no mesmo período. Revalida proprietário, contrato, produto, preço e estado da loja antes de comprar. Mudanças de plano/período, redução de capacidade, Google e Web seguem pelo gerenciamento da origem. O ajuste proporcional pertence à loja e não é calculado pelo app.
- Produtos vitalícios, compras avulsas e concessões promocionais sem uma assinatura mapeada não concedem plano de equipe neste fluxo.
- A chave pública do SDK permite consultar informações de um App User ID conhecido. Por isso, o ID opaco só é entregue ao proprietário; não há recibos ou dados de cartão no banco do aplicativo.
- O log de webhook armazena somente ID, tipo, ambiente e data, sem payload bruto. Monitorar falhas/retries no painel RevenueCat e logs das funções. A política de retenção desse log deve preservar a janela operacional de retries.

## Validação local

```sh
npx tsc --noEmit -p tsconfig.app.json
npm test
node supabase/tests/revenuecat_billing.mjs
node supabase/tests/team_member_limits.mjs
node supabase/tests/platform_admin_and_support.mjs
npx --yes deno check --no-lock supabase/functions/revenuecat-sync/index.ts supabase/functions/revenuecat-webhook/index.ts
npx --yes deno test --no-lock --allow-env --allow-net=esm.sh supabase/tests/revenuecat_edge.test.ts
npm run build
```

Os testes de SDK/React usam mocks, os de banco executam as migrações reais no PGlite isolado e os testes Deno interceptam todas as chamadas HTTP da requisição. Nenhum deles comprova uma compra na loja real. `scripts/qa-revenuecat.mjs` verifica a UI real no Chromium em 320/390/1440 px com transporte e adapter sintéticos; instruções no início do script.

Referências oficiais consultadas: [SDK Web](https://www.revenuecat.com/docs/web/web-billing/web-sdk), [Capacitor](https://www.revenuecat.com/docs/getting-started/installation/capacitor), [webhooks](https://www.revenuecat.com/docs/integrations/webhooks), [modelo REST v1](https://www.revenuecat.com/docs/api-v1/customer-info-model), [restauração](https://www.revenuecat.com/docs/projects/restore-behavior), [localização](https://www.revenuecat.com/docs/web/web-billing/localization).

### Validação da tela e do catálogo nesta etapa

- TypeScript e ESLint dos módulos de billing sem erros; builds do app e da landing concluídos.
- 46 testes de billing (modelo, SDK e React), seis testes da landing e 49 verificações de banco isolado, incluindo seed idempotente e produtos desabilitados.
- 48 verificações da UI em 320/390/1440 px: seleção de plano, período por teclado, `+1`, preço por faixa, checkout, confirmação do novo produto, ampliação e restauração. Capturas em `/tmp/maislouvor-plan-builder-qa` inspecionadas; transporte e checkout são sintéticos.
- O checkout paralelo `MaisLouvor-lojas` não recebeu alterações, e o TestFlight permanece separado desta implementação. Nenhum deploy, compra real ou upload nativo foi executado nesta etapa.

Prévia interativa local: `http://127.0.0.1:4199/tmp/billing-preview/`, com o componente real e dados de demonstração, sem SDK ou cobrança. Verificada em 390/1440 px. Arquivos locais ignorados em `tmp/billing-preview/`; não entram no build de produção.

### Revisão de 07/10/2026

Tela refeita conforme o design atual, com CTA flutuante Liquid Glass, botão Voltar e fluxo de entrada pelo convite bloqueado. [Decisões visuais e validação](ux/billing-20261007.md). [Política de cinco integrantes, ilimitados anteriores e admin](billing/member-limits.md).

Validação mais recente: 61 testes de billing/convite/admin, 57 verificações novas de banco, TypeScript/ESLint e build. Fluxos de UI executados em WebKit e Chromium, incluindo claro/escuro e larguras de 320 a 1440 px. Continua sem deploy, migração em produção ou upload nativo.
