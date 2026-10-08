# Integração de lojas e RevenueCat — 07/10/2026

Filipe autorizou juntar a preparação das lojas com a integração de cobrança que já estava publicada na web. O resultado está na branch `codex/integracao-lojas-revenuecat`, no checkout `MaisLouvor-lojas`.

## Fontes integradas

- Preparação nativa e de conformidade: checkpoint `3c236be`, criado a partir de `feat/conformidade-lojas`, preservando as alterações desta frente.
- RevenueCat e Stripe: `codex/web-billing-release`, commit `4df52e7`, incluindo a publicação web `f30e45e` e a base efetivamente publicada `51b2d7b`.
- Os checkouts da integração de cobrança e do `main` compartilhado não foram alterados. `.env` continua fora dos commits.

## Resultado

- Login Google, Apple no iOS, Face ID opcional e o carrossel aprovado mantidos.
- Asafe e a separação local de faixas com Demucs mantidos. Removidos apenas a sugestão de músicas por IA e a importação do Moises, conforme a correção de escopo do titular.
- Assinaturas RevenueCat/Stripe, controle de capacidade, contratos ilimitados anteriores e gerenciamento administrativo integrados à moderação, denúncias, bloqueio, consentimentos e exclusão de conta.
- Ajustes agora conciliam as abas Perfil, Membros, Equipe e Assinatura. Links de denúncia, retorno de pagamento e exclusão abrem a aba correspondente; a escolha de plano pelo convite preserva a equipe e a quantidade de integrantes. O botão Voltar retorna à aba de origem.
- Instruções de navegação do app e do Asafe atualizadas para Perfil. Termos e Privacidade descrevem a cobrança existente, RevenueCat e Stripe. A exclusão avisa sobre compras web e oferece o caminho para gerenciar a assinatura, sem exigir cancelamento para apagar a conta.
- SDK nativo RevenueCat sincronizado por Capacitor no iOS e Android. Dependências Swift fixadas no `Package.resolved`. Chaves públicas Apple e Web existentes copiadas para `.env.production.local`, ignorado pelo Git; nenhuma chave privada foi incorporada ao cliente. Chave Google não configurada.

## Validações executadas

- TypeScript: sem erros.
- Vitest: **439 testes / 51 arquivos aprovados**, incluindo quatro testes novos das transições entre assinaturas, moderação e exclusão.
- Banco PostgreSQL local (PGlite): **144 verificações** das migrações conjuntas de conformidade, com as de cobrança aplicadas antes; **52** verificações RevenueCat e **57** de capacidade. A reaplicação cobre apenas as nove migrações idempotentes desta frente, sem reaplicar as migrações de cobrança.
- Asafe: **140 verificações unitárias e 94 de fluxo** aprovadas.
- Funções de cobrança: **35 testes Deno** aprovados, com rede de pagamentos simulada; catálogo web: **3 testes** aprovados.
- Ensaio das nove migrações de lojas no banco publicado: aplicação duas vezes dentro de transação e `ROLLBACK`; schema confirmado inalterado. Evidência local em `tmp/integration-20261007/database/database-preflight.json`.
- Builds locais de QA web e store concluídos. Navegador a 440 × 956 e 1024 × 1366: busca, inclusão/repetição de música, edição de cifra/letra e transposição local aprovadas, sem rolagem horizontal, erros de página ou chamadas às funções removidas. Capturas locais em `tmp/remove-music-ai/`.
- Capacitor: sincronização iOS e Android concluída. Xcode: **BUILD SUCCEEDED**, Debug para simulador iOS, sem assinatura. O bridge inclui `PurchasesPlugin` junto dos plugins já usados. Log local: `/tmp/maislouvor-integration-xcode.log`.
- `npm run build` de release bloqueia corretamente pelos **10 valores jurídicos pendentes**. Os builds de QA não foram publicados.

## Estado de publicação e pendências

**Esta integração não alterou a produção e não enviou uma compilação ao TestFlight.** A web permanece na publicação RevenueCat/Stripe registrada em [web-release-20261007.md](../../billing/web-release-20261007.md). O último TestFlight confirmado continua em **1.0.0 (6)**.

A release conjunta depende dos dados reais já solicitados em `src/lib/legal.ts` (responsável, contatos, infraestrutura e definições de privacidade). O guard de release não foi removido ou contornado para publicação. SMTP continua adiado por decisão do titular.

Para a próxima publicação: partir desta integração, preencher/revisar os documentos e aplicar somente o delta de backend em conjunto com o cliente, incluindo versões legais e consentimento estrito do Asafe. Preservar o ambiente Apple e RevenueCat já configurado no servidor. Não executar novamente os scripts de implantação de cobrança de uso único, nem reaplicar suas migrações/catalogação sobre as contas existentes. Não usar o gerador histórico de snapshots TestFlight, que não contém esta integração.

A compilação em simulador não substitui compra/restauração sandbox e login/revogação Apple em iPhone real. Não houve compra, cancelamento, convite de tester, cobrança real, archive assinado ou envio às lojas nesta etapa. Android foi sincronizado, mas não compilado nesta validação.
