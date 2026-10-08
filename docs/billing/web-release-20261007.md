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
  nos dois motores também no HTTPS publicado. WebKit registrou duas tentativas
  do iframe Stripe de acessar outra origem, corretamente bloqueadas pelo navegador;
  formulário renderizado e retorno aos planos passaram. Não houve erro JavaScript
  da aplicação nesse fluxo.
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

## Publicação concluída

- App web publicado no commit `f30e45eb723725aa4f47750f8e9f14c35993e0b2`,
  na branch `codex/web-billing-release`: 195 arquivos conferidos, 109 assets/shell
  por HTTPS e rotas `/app/settings`, `/admin/assinaturas` e `/login` corretas.
- O fluxo real de contratação → checkout → Voltar aos planos passou no domínio
  definitivo em Chromium e WebKit. Nenhum cartão foi preenchido nem cobrança enviada.
- As sete contas sintéticas e a equipe de QA foram removidas. Conferência final:
  6 equipes, 31 vínculos, 6 concessões ilimitadas anteriores e nenhum contrato real
  de cobrança criado por esta validação. Nenhuma concessão administrativa de QA ficou salva.
- Depois da publicação do app, foi detectada a fórmula antiga de preços na landing
  para faixas acima de 50 pessoas. `align-published-landing-prices.py` atualizou só
  as quatro tabelas/função de preço e os textos de disponibilidade, com novos nomes
  de bundles. Layout, CSS, mídias, animações, APKs e Caddy foram preservados.
  A primeira tentativa foi revertida automaticamente ao encontrar o redirecionamento
  já existente de `/conheca/` para `/`; a segunda verificou e preservou essa rota.
  Registro: `landing-price-alignment-v2/result.json`.
- 148 verificações Playwright dos preços públicos: 4 planos × 9 capacidades × 2
  períodos, pelas duas URLs, além da disponibilidade e ausência de transbordamento.
- O código-fonte publicado está arquivado sem credenciais no servidor. O checkout
  compartilhado não foi trocado de branch nem recebeu merge; não houve push.

As notas de preparação `web-billing.md`, `member-limits.md` e `revenuecat.md`
continuam úteis para configuração, mas seus trechos históricos de ativação pendente
são substituídos pelo estado confirmado acima. Builds nativos e cenários completos
do provedor ainda não exercitados permanecem com as limitações descritas.
