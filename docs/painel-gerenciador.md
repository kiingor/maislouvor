# Gerenciador da plataforma +Louvor

Publicado em **29/09/2026 às 21:42 de Fortaleza** (30/09 às 00:42 UTC), com portal em [maislouvor.com/admin](https://maislouvor.com/admin) e atendimento em `/app/sugestoes`. A migration foi aplicada na produção `api.maislouvor.com`, e a conta confirmada indicada pelo proprietário recebeu o acesso exclusivo. O login usa a senha já cadastrada nessa conta; não foi criada nem alterada uma senha administrativa.

A release `20260930-platform-admin` foi integrada à fonte exata do aplicativo publicado, na branch `release/platform-admin-20260930`, em `/private/tmp/maislouvor-platform-release-20260930/source`. A `main` deste checkout continua sendo uma variante anterior, configurada para a base Cloud: não publique seu build inteiro sobre o site atual. Não há provedor de cobrança integrado.

## O que está disponível

| Área | Recursos |
| --- | --- |
| Visão geral | Totais de equipes, usuários, vínculos, músicas, repertórios, cultos, assinaturas e tickets; períodos de 7, 30 e 90 dias; crescimento diário; fila de atendimento e contas recentes. |
| Contas | Busca por equipe, responsável ou e-mail; filtro por plano; paginação; resumo individual com membros, instrumentos, convites pendentes, conteúdo recente, assinatura e tickets. |
| Membros | Todos os usuários do Auth, inclusive sem perfil ou equipe; confirmação do e-mail, último login e vínculos com cada equipe. |
| Assinaturas | Registros manuais de plano, situação, valor mensal, fim do período e observações internas; resumo dos valores ativos e acesso ao registro por conta. |
| Sugestões e bugs | Busca, status, tipo e prioridade; conversa individual; resposta do administrador; atualização do andamento e histórico. |
| Configurações | Pausar novos tickets, definir contato de atendimento e mensagem na área de sugestões; últimas 30 ações administrativas. |
| Área do usuário | Criar melhorias ou bugs, pesquisar os próprios tickets, consultar respostas e enviar detalhes adicionais. |

Uma **conta** no gerenciador representa uma equipe. Um **usuário** é um cadastro no Auth. Um usuário pode ter vários vínculos de membro, por isso os totais são apresentados separadamente. “Último acesso” e “equipes com acesso no período” usam `auth.users.last_sign_in_at`, não uma medição de atividade em cada tela.

As novas telas são carregadas sob demanda. A navegação do aplicativo inclui **Sugestões e suporte**; **Gerenciador** aparece somente para o administrador da plataforma. No celular, o gerenciador tem menu lateral próprio, resumos empilhados e rolagem horizontal dentro das tabelas.

A identidade visual segue o sistema: preto, branco e cinzas neutros, inclusive em gráficos, estados e atendimento. Ícones e rótulos identificam o status de cada ticket; as séries do gráfico usam linha contínua e tracejada para manter a distinção sem cores.

## Atendimento e notificações

O ticket começa em **Aberto** e pode ficar **Em análise**, **Planejado**, **Em andamento**, **Resolvido** ou **Encerrado**. Prioridades disponíveis: baixa, normal, alta e urgente.

A resposta do administrador e a notificação são gravadas na mesma transação. Alterar o status também gera uma notificação; alterar apenas a prioridade não gera. O retorno tem tipo `support_feedback`, identifica a Equipe +Louvor e abre `/app/sugestoes/<ticket>`. A entrega usa a tabela e o sino existentes, com atualização por Realtime, ao abrir o sino, ao retornar à janela e a cada 30 segundos. Isso é uma notificação dentro do aplicativo; esta entrega não acrescenta push do sistema nem envio por e-mail.

Quando o usuário responde a um ticket resolvido ou encerrado, ele volta a **Aberto**. Pausar novos tickets preserva a leitura e a resposta nas conversas existentes. A fila administrativa atualiza a cada 30 segundos; uma conversa aberta atualiza a cada 15 segundos. Limites por usuário no servidor: 10 novos tickets e 60 mensagens por hora. Assunto: 5–160 caracteres; relato: 20–8.000; mensagem: 2–8.000.

## Acesso e persistência

`platform_admins` é a autorização global. Ser líder (`team_members.role = 'admin'`) não concede esse acesso. O cliente não pode inserir ou modificar administradores, assinaturas, configurações, auditoria ou mensagens diretamente. As operações passam por funções que consultam a identidade autenticada e verificam a autorização no servidor.

As tabelas novas têm RLS e privilégios explícitos, inclusive revogações dos privilégios automáticos do Supabase. As funções usam `SECURITY DEFINER`, `search_path` vazio, referências qualificadas e execução negada a visitantes. As consultas administrativas retornam os dados necessários ao portal e preservam as políticas existentes de equipes e perfis. Cada usuário lê apenas seus tickets; o servidor define o autor e a identificação do suporte.

As decisões seguem a documentação de [RLS do Supabase](https://supabase.com/docs/guides/database/postgres/row-level-security) e de [funções com privilégios do proprietário no PostgreSQL](https://www.postgresql.org/docs/current/sql-createfunction.html#SQL-CREATEFUNCTION-SECURITY).

Tabelas: `platform_admins`, `platform_settings`, `platform_audit_log`, `account_subscriptions`, `support_tickets` e `support_ticket_messages`. A auditoria registra respostas, mudanças de tickets, assinaturas e configurações; não replica o texto das respostas nem as observações internas das assinaturas.

## Assinaturas nesta versão

O registro manual organiza plano e período. Salvar uma assinatura não efetua cobrança nem libera ou bloqueia recursos. Não foi escolhido um gateway nesta sessão; Apple/Google, Stripe e AbacatePay são apenas origens reservadas no modelo para uma integração futura. A interface não permite forjar essas origens, e registros de provedores externos não podem ser alterados pela função de controle manual.

O valor mensal exibido é a soma dos valores informados em registros ativos, em reais. Não representa recebimento financeiro confirmado. A data de fim do período é um registro administrativo; seu vencimento não muda automaticamente o status.

## Publicação realizada

- Base publicada: `3af8d34d128503d4120f8cb06e8ca7c42c54f307`, com os 417 arquivos selados da entrega do guia do Asafe e as regras atuais da landing incorporados. As telas existentes, permissões granulares, Asafe e cinco APKs foram preservados.
- Somente a nova migration foi aplicada, em transação, após verificação de compatibilidade e ensaios com rollback. A concessão inicial deixou exatamente um administrador global. A senha da conta não foi alterada.
- Backup do schema anterior em `/var/backups/maislouvor/20260930-platform-admin-backend`; backup do site em `/var/backups/maislouvor/20260930-platform-admin`. A release fica em `/var/www/maislouvor-releases/20260930-platform-admin`.
- Publicação com lock compartilhado, hashes conferidos, cópia dos assets preservando os anteriores e troca dos arquivos de entrada com o service worker por último. Foram conferidos **190 arquivos e 10 rotas por HTTPS**.
- A landing recebeu alterações simultâneas no cache e no manifesto do PWA. Os hashes divergentes interromperam duas tentativas antes da troca do site. As diferenças foram revisadas e incorporadas: helper de recuperação, exclusão da raiz e de `/conheca` do fallback, `directoryIndex: null`, manifesto com `id: /` e início em `/app`. Caddy, marketing, sitemap, robots e verificação do Search Console foram preservados; nenhum serviço foi reiniciado nesta publicação.
- A release usa `platform-client.ts` como uma tipagem separada da conexão autenticada existente. Isso mantém a tipagem gerada da versão publicada intacta: ficaram os mesmos **9 diagnósticos anteriores**, sem erros novos.
- Validação da versão integrada: **149 testes existentes**, **41 verificações do navegador com dados sintéticos**, **17 verificações com API real antes da troca e 17 no site público**, além de **6 verificações com service worker ativo** para coexistência do app e landing. O fluxo real cobriu criação de ticket, resposta, notificação, abertura pelo sino e bloqueio de usuários comuns/visitantes. A conta temporária, seus tickets, mensagens, notificações e registros de auditoria foram removidos.
- Evidências locais em `/private/tmp/maislouvor-platform-release-20260930`; publicação remota registrada em `/var/lib/maislouvor-deploy/20260930-platform-admin/publish.log`. Não houve push, alteração do APK nem migração de conteúdo da base Cloud.

Uma reversão do frontend pode restaurar os arquivos de entrada do backup, mantendo os assets. A estrutura de suporte é aditiva e pode permanecer no banco; não remova tabelas contendo tickets de usuários. Confira mudanças posteriores antes de qualquer restauração.

## Ativação em outra base

Há uma divergência documentada entre a base Cloud configurada neste checkout e o ambiente de produção da VPS. Confirme o destino do frontend e do banco antes de ativar. Não execute toda a cadeia antiga de migrations contra a produção: ela possui diferenças de permissões e outras alterações independentes.

Na conexão administrativa da base escolhida:

1. Verifique a compatibilidade com `supabase/setup/platform-preflight.sql`.
2. Aplique **somente** `supabase/migrations/20260930010000_platform_admin_and_support.sql` em uma transação. A migration acrescenta a estrutura; não concede automaticamente administração a ninguém.
3. Execute `supabase/setup/platform-owner.sql` com `admin_email` contendo o e-mail autorizado informado pelo proprietário. A conta precisa existir e ter o e-mail confirmado. O script é idempotente para a mesma conta e interrompe a operação se encontrar outro administrador.
4. Publique o frontend apontando para a mesma base. Preserve o fallback de rotas da SPA para `/admin/*` e `/app/sugestoes/*`.
5. Faça o teste com duas contas no ambiente: o proprietário acessa `/admin`, um membro abre um ticket, o proprietário responde e o membro abre o retorno pelo sino. Confirme também que o membro recebe “Acesso restrito” ao visitar `/admin`.

Exemplo com `psql` e uma conexão administrativa já configurada, sem colocar credenciais no código:

```sh
psql -X -v ON_ERROR_STOP=1 -f supabase/setup/platform-preflight.sql
psql -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/migrations/20260930010000_platform_admin_and_support.sql
psql -X -v ON_ERROR_STOP=1 -v admin_email="$PLATFORM_ADMIN_EMAIL" -f supabase/setup/platform-owner.sql
```

Revogação, somente pela conexão confiável: remova o `user_id` correspondente de `platform_admins`. A autorização dos endpoints é reavaliada em cada chamada; a interface verifica novamente o acesso a cada minuto e ao recuperar foco. Não há credencial administrativa embutida no navegador.

## Validação

- Vitest: os **89 testes existentes** passaram.
- PostgreSQL/PGlite: **92 verificações aprovadas** com a migration real, compatibilidade da base, privilégios automáticos simulados, concessão inicial do proprietário, isolamento de administrador/líder/usuário externo/visitante, leitura dos tickets, respostas, notificações, rollback, reabertura, limites, paginação, assinaturas e revogação.
- Chromium: **41 verificações** com componentes reais e API interceptada com dados sintéticos, incluindo navegação completa, filtros, paginação, plano manual, retorno por notificação, criação de ticket, bloqueio de acesso e larguras de 320, 390 e 1440 px. Capturas em `/tmp/maislouvor-admin-qa`.
- TypeScript, ESLint dos arquivos novos/editados e build Vite/PWA verificados. O build mantém o aviso anterior sobre o tamanho do bundle principal.

A revisão da identidade em preto e branco repetiu TypeScript, ESLint, build e as 41 verificações do navegador. As capturas atualizadas, também com dados sintéticos, ficam em `/tmp/maislouvor-admin-monochrome-qa`.

Reprodução dos testes isolados, com dependências de QA disponíveis fora do projeto quando necessário:

```sh
npm test
./node_modules/.bin/tsc --noEmit -p tsconfig.app.json
npm run build
PGLITE_MODULE=/caminho/node_modules/@electric-sql/pglite/dist/index.js node supabase/tests/platform_admin_and_support.mjs
```

Para o teste do navegador, inicie uma instância separada do Vite com a URL de backend fictícia esperada pelo script:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54329 VITE_SUPABASE_PUBLISHABLE_KEY=qa-placeholder npm run dev -- --port 4193 --host 127.0.0.1
PLAYWRIGHT_MODULE=/caminho/node_modules/playwright/index.mjs CHROMIUM_PATH=/caminho/chromium node scripts/qa-platform-portal.mjs
```

Os dados sintéticos existem apenas nos testes locais. A publicação descrita acima também validou a API real com uma conta temporária e a autorização do proprietário, sem solicitar ou alterar sua senha. Não houve cobrança, migração de dados entre bases nem atualização do APK.
