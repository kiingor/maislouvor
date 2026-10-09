# Diagnóstico das ofertas no TestFlight — 9 de outubro de 2026

Inspeção somente leitura após o relato de que a aba de assinatura do build iOS 7 exibia “Não foi possível carregar os planos”. Nenhuma conta, permissão, consentimento, catálogo ou configuração de cobrança foi alterada nesta investigação. Não houve compra, convite ou mensagem externa.

## Resultado do backend

A equipe informada foi localizada de forma inequívoca. Seu responsável tem perfil e conta Apple vinculados corretamente, papel de administrador, participação autorizada e vínculo opaco de cliente RevenueCat já existente. A equipe tem um integrante e assinatura gratuita/manual de cinco vagas, sem acesso ilimitado, produto comprado ou entitlement ativo. Identificadores e dados pessoais não foram registrados aqui.

O catálogo do banco tem 136 produtos habilitados: 70 de Stripe e 66 de Apple. Quatro produtos Apple anuais de maior capacidade estão desabilitados; isso não explica uma exceção de carregamento de todo o catálogo. O RPC `get_team_billing_context` está disponível ao papel autenticado. Nos logs agregados de uma janela recente de 20 minutos, foram observadas 24 chamadas desse RPC e duas de `revenuecat-sync`, todas com HTTP 200, sem marcadores de erro encontrados nessas linhas. As contagens são globais: não são atribuídas integralmente à conta relatada.

O RPC não foi invocado artificialmente, porque ele pode criar um vínculo de cliente quando ainda não existe. A inspeção utilizou consultas SQL `READ ONLY`, metadados e logs, sem gravações.

No frontend, a mensagem específica aparece quando `billing-offers` falha, após o contexto de cobrança já ter autorizado o responsável. O fluxo seguinte chama a configuração/login do SDK, `getOfferings()` e `getCustomerInfo()`. Um resultado vazio por filtro de catálogo, sozinho, não produz essa mensagem de erro. Fontes: `src/components/billing/TeamBilling.tsx`, `src/lib/billing/api.ts` e `src/lib/billing/revenuecat.ts`.

## Bloqueio Apple confirmado pelo coordenador

O agente principal verificou no App Store Connect, em Negócios, que o acordo de **apps pagos** estava no estado **Novo**, enquanto o acordo gratuito estava ativo; a interface exigia a assinatura para disponibilizar compras. O responsável foi orientado pelo coordenador a concluir pessoalmente essa etapa contratual.

Atualização posterior do coordenador: o aceite foi registrado e o acordo passou a **Pending User Info**. O titular estava preenchendo W-8BEN e dados bancários; a conclusão ainda não estava confirmada. O carregamento nativo das ofertas após a ativação continua pendente de teste.

Na consulta somente leitura do RevenueCat feita pelo coordenador, o bundle estava correto, a oferta padrão estava selecionada e havia 66 packages e 70 produtos Apple. A chave de transações de assinaturas estava configurada. A chave da API do App Store Connect estava ausente; ela é uma credencial distinta e não deve ser confundida com a chave de transações.

O acordo pendente é um bloqueio objetivo a resolver. **Ainda falta demonstrar que as ofertas nativas carregam após ele ficar ativo**; não foi obtido nesta inspeção o erro detalhado do SDK no aparelho para atribuir toda a exceção exclusivamente a esse fator.

## Próxima restrição do teste de compra

O backend está configurado com `REVENUECAT_ENVIRONMENT=PRODUCTION`. O webhook ignora eventos de ambiente diferente (`supabase/functions/revenuecat-webhook/handler.ts`) e a projeção de assinaturas filtra o campo `is_sandbox` (`supabase/functions/_shared/revenuecat-model.ts`). Assim, uma compra sandbox do TestFlight não será convertida em acesso pago por esse fluxo atual, mesmo depois que a oferta carregar.

Não alterar o servidor inteiro para SANDBOX, pois a cobrança web de produção usa o mesmo backend. Na etapa seguinte foi preparada uma autorização por cliente, restrita à Apple, ao dono da equipe e a 14 dias, descrita em `revenuecat-sandbox-controlado-20261009.md`. Ela passou pelos testes e preflight, mas sua aplicação ainda depende da revisão do coordenador. Este diagnóstico somente leitura não mudou a configuração.
