# Limites de integrantes e contas anteriores

**Atualização de 07/10/2026: backend, webhook e app Web publicados.** As seis equipes anteriores continuam ilimitadas; novas equipes têm cinco vagas gratuitas. Veja [a implantação e a validação final](web-release-20261007.md). As referências a “local” e “pendente” abaixo descrevem a preparação anterior.

Política solicitada em 07/10/2026. Implementação local em `supabase/migrations/20261007090000_team_member_limits.sql`.

## Regra

Uma conta de cobrança corresponde a uma **equipe**, não a um cadastro individual. O líder ocupa uma vaga.

| Situação | Acesso para novos integrantes |
| --- | --- |
| Equipe criada depois da ativação | Essencial gratuito, até 5 integrantes |
| Assinatura RevenueCat válida | Capacidade do produto confirmado pelo servidor |
| Renovação cancelada, período ainda válido | Mantém capacidade até o vencimento |
| Período expirado, sem direito vigente | Volta à capacidade gratuita de 5; integrantes existentes permanecem |
| Contrato manual ativo/em teste e ainda vigente | Capacidade registrada pelo administrador |
| Equipe existente na ativação | Ilimitado permanente, condição anterior preservada |
| Concessão administrativa explícita de ilimitado | Sem limite enquanto a concessão estiver vigente |

O sexto integrante exige contratação pelo proprietário da equipe. Um usuário com papel Líder que não seja o proprietário não ganha permissão de cobrança. O app orienta procurar o líder responsável.

Um novo time criado por um usuário antigo depois da ativação é uma nova conta e recebe cinco vagas. Não há limite automático aplicado a equipes já cadastradas. O instante de corte é a execução da migração no ambiente real.

## Preservação

A migração trava a criação de equipes durante a transação, registra todas as equipes existentes com `is_unlimited=true` e `unlimited_reason='legacy'`, e instala a inicialização gratuita para as futuras. Conserva os contratos, valores, provedores, notas, membros e conteúdos existentes. Não cancela nem cria assinaturas nas lojas.

A concessão é independente do estado RevenueCat. Sincronizações, expirações e webhooks não removem essa marcação. O RPC administrativo recusa retirar o acesso de origem `legacy`. O app não abre ofertas de compra para ilimitados; se houver contrato de loja anterior, seu gerenciamento continua disponível.

## Aplicação no servidor

`get_team_member_capacity` exige que o solicitante pertença à equipe ou seja seu proprietário. Não entrega observações internas, identidade de cobrança ou dados de outros usuários.

Triggers em `team_invites` e `team_members` conferem a capacidade para criar/renovar convites e concluir entradas, inclusive com `service_role`. A aceitação existente continua exigindo o destinatário correto e um convite válido. Uma trava transacional por equipe, compartilhada com a sincronização e o admin, serializa as alterações de capacidade e entradas.

Convites pendentes não reservam vagas. A última vaga é usada por quem concluir primeiro; os demais convites permanecem pendentes e válidos até a expiração. Uma recusa por limite não consome o convite. Depois de ampliar o plano ou liberar uma vaga, a pessoa pode tentar aceitar o mesmo link.

As Edge Functions retornam HTTP 409 e `TEAM_MEMBER_LIMIT_REACHED`. O app mostra o motivo e não apresenta uma falha de capacidade como convite inválido. A capacidade RevenueCat é calculada com o vencimento e os entitlements confirmados, mesmo se o webhook estiver atrasado.

Na Web/Stripe, antes de negar vagas por um vencimento local anterior, a geração/aceitação de convite consulta RevenueCat quando ainda havia um entitlement pago. A consulta de capacidade também permite essa atualização a líderes autorizados, sem revelar dados de cobrança. Isso cobre o intervalo entre a renovação Stripe e a chegada da notificação de pagamento; detalhes em [Web Billing](web-billing.md).

## Admin

- **Assinaturas** mostra plano, capacidade e origem da concessão ilimitada.
- **Contas** identifica e filtra ilimitados; o detalhe mantém o mesmo rótulo.
- Contratos manuais permitem definir capacidade ou conceder ilimitado, com autorização de plataforma e auditoria.
- O Essencial gratuito sempre tem cinco vagas; aumentar esse campo não cria um gratuito maior.
- Assinaturas de loja e sua capacidade são somente leitura. As alterações vêm do RevenueCat.
- Nenhum campo desse formulário realiza cobranças ou calcula prorrateio.

## Ativação pendente

1. Preparar e homologar a cobrança: migração administrativa, `20261006220000_revenuecat_billing.sql`, catálogo real, secrets do servidor, funções e compra sandbox. Confirmar o ambiente Supabase auto-hospedado correto; não executar `db push` genérico com os demais trabalhos locais.
2. Com a compra funcionando e o build pronto, aplicar **uma vez** `20261007090000_team_member_limits.sql`. Revisar a contagem de equipes preservadas e novas na mesma implantação. A migração deve entrar antes do frontend que exige `get_team_member_capacity`.
3. Publicar as versões atualizadas de `create-invite` e `accept-invite`, junto do frontend/native com o fluxo de contratação. Os triggers também protegem chamadas antigas; as funções novas entregam o erro compreensível.
4. No ambiente de homologação, conferir uma equipe anterior ilimitada, uma equipe criada depois com cinco integrantes, a recusa da sexta entrada e a liberação após compra confirmada. Validar duas aceitações concorrentes na última vaga usando PostgreSQL real.

Não ativar o bloqueio de novas contas em um ambiente em que o líder ainda não consegue concluir a contratação. Esta entrega inclui código, migração e testes; não alterou contas reais nem publicou um novo build.

## Testes e limites

`node supabase/tests/team_member_limits.mjs` aplica as migrações de billing e a rotina real de aceitação em PostgreSQL/WASM isolado. Verifica 57 condições: preservação, nova conta, autorização, limite na criação/aceitação, entradas diretas, convite não consumido, vaga liberada, contratos manuais, administração, compra, cancelamento e vencimento. PGlite não substitui o teste concorrente com sessões independentes em PostgreSQL real.

O controle implementado nesta revisão é de **integrantes**. Não adiciona quotas operacionais de IA, armazenamento, repertórios ou mensagens do Asafe; esses serviços mantêm seu estado anterior. O plano gratuito é identificado como Essencial, e os planos pagos continuam vindos do catálogo confirmado.
