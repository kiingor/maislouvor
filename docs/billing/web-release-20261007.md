# Ativação Web — 07/10/2026

Filipe autorizou ativar backend/webhook e publicar as assinaturas Web. Esta versão
parte do código efetivamente publicado, `51b2d7b` (`release/platform-admin-20260930`),
em vez do `main` compartilhado, que estava atrás da produção. Mantém Asafe,
permissões, configurações de equipe e o contrato de inclusão direta de membros.

## Backend publicado

- Destino: Supabase auto-hospedado de `api.maislouvor.com`, em `louvor-vps`.
- Quatro migrações específicas: pré-requisitos de convites/rate limit, RevenueCat,
  preservação/limites e catálogo privado Stripe. Catálogos Apple e Stripe aplicados;
  Stripe contém os 70 preços de produção. Não foi usado `db push`.
- **Seis equipes anteriores / 31 integrantes preservados.** Todas essas equipes
  receberam ilimitado permanente, protegido contra remoção por sincronização ou admin.
- Equipes novas: Essencial gratuito até cinco pessoas contando o responsável.
  Triggers protegem convites, cadastro direto e aprovações, inclusive concorrentes.
- Convites antigos com vencimento nulo continuam válidos. O fluxo do app instalado
  (`team_ids`, nome, senha) continua disponível, com inserção atômica entre equipes.
- Credenciais em `.env.billing` privado no servidor, adicionado ao `env_file` já
  existente da Apple. Variáveis antigas, imagem e demais funções foram conferidas.
- RevenueCat Webhook: produção, todos os eventos/apps, cabeçalho secreto. Teste
  disparado pelo próprio painel retornou HTTP 200, `received: true, test: true`.
- Scripts de implantação usam lock, backups privados, hashes e ensaio SQL com
  `ROLLBACK`. Registro remoto: `/var/lib/maislouvor-deploy/20261007-web-billing`.

## Interface

Usuário → Assinatura: quatro planos, integrantes e mensal/anual; preços reais do
SDK formatados em pt-BR. Botão flutuante alinhado ao conteúdo e botão Voltar.
A sexta pessoa abre a contratação com quantidade sugerida seis (faixa de dez).
O checkout Stripe também possui “Voltar aos planos”, usando o cancelamento por
histórico do SDK para liberar a compra pendente e manter a seleção.

Admin → Assinaturas: plano, capacidade e origem ilimitada; edição manual autorizada
por conta e assinaturas RevenueCat somente leitura. A tela mantém a estrutura do
gerenciador já publicado.

## Evidência

- 67 testes Vitest de billing/admin; 35 Deno de sync/webhook/portal; 3 de catálogo.
- 52 verificações SQL de billing e 57 de capacidade; ensaio transacional sobre o
  esquema real com rollback antes da aplicação.
- 48 verificações HTTPS com usuários sintéticos: login real, inclusão direta,
  convite, bloqueio da sexta entrada, convite preservado após falha, duas inserções
  concorrentes para a última vaga, isolamento da identidade e sync real RevenueCat.
- Consulta administrativa real validada em transação com rollback, sem deixar
  permissão administrativa na conta de QA.
- Chromium e WebKit: 75 verificações por engine em 320, 390, 440, 844 e 1440 px.
  Checkout real aberto sem cartão ou pagamento enviado. Retorno visível confirmado
  no Chromium. WebKit local registrou acesso entre iframe HTTPS e página HTTP;
  a confirmação final desse fluxo deve usar o endereço HTTPS publicado.
- Build Vite/PWA aprovado. `deno check` aprovado nos cinco endpoints. TypeScript
  global mantém os nove diagnósticos da base publicada, fora dos arquivos de billing
  (tipos antigos de team_join_requests/duration_seconds e builders PromiseLike).

As compras completas mensal/anual foram feitas somente no Stripe Sandbox isolado,
na etapa anterior. Recusa/3DS, renovação, cancelamento e ampliação têm testes de
contrato/estado, mas nem todos foram exercitados end-to-end no provedor. Não houve
cobrança real nesta ativação. Não foram alteradas quotas de IA/armazenamento/Asafe,
nem publicados novos binários nativos.

`publish-web-billing.py` publica apenas o build web, copia assets antes do shell,
confere os arquivos por HTTPS e preserva landing, Caddy e APKs. O relatório
`web-result.json` no registro remoto confirma a publicação efetiva; só criar o
build ou este commit não comprova que ele está no ar.

As contas temporárias de QA são removidas por `qa-web-billing.py cleanup`, limitado
aos UUIDs e marcadores registrados por esta execução. Credenciais e sessões ficam
fora do Git, em arquivos privados.
