# Teste Apple sandbox por cliente — aplicado e validado

O backend de produção continua usando `PRODUCTION`. Para a equipe de teste indicada pelo usuário, foi aplicada uma exceção de **14 dias**, vinculada ao cliente RevenueCat opaco, ao dono atual da equipe e exclusivamente à loja **app_store**. Nenhum identificador real está neste documento ou no código: a seleção e o artefato de aplicação ficam em arquivos privados no Mac, modo `0600`.

## Política e proteção de contratos

- A migração `20261009010000_revenuecat_apple_test_policy.sql` cria `revenuecat_test_customers`, sem cadastrar ninguém. A tabela e o RPC de política só podem ser usados pelo backend; não há acesso pelo cliente autenticado/anon.
- Para cadastrar a exceção, o contrato deve ser gratuito/manual, sem compra, ambiente RevenueCat, entitlement ou acesso ilimitado. O dono precisa corresponder ao dono atual da equipe. A configuração sozinha não altera o plano nem concede acesso.
- `revenuecat_customer_policy` responde `PRODUCTION` para os demais clientes; desconhecidos não podem sincronizar. Uma autorização válida responde `SANDBOX` com escopo fixo `app_store`.
- `syncRevenueCat` consulta essa política, busca o estado atual com a chave privada do RevenueCat e projeta somente compras elegíveis. Não utiliza recibos ou dados de compra enviados pelo cliente. Stripe sandbox não pode conceder acesso pela exceção Apple.
- Uma compra real ativa encontrada no RevenueCat bloqueia a projeção sandbox mesmo que seu webhook ainda não tenha chegado ao banco. Contratos reais já registrados não podem ser inscritos para teste nem substituídos por uma compra de teste.
- O webhook resolve a política de cada cliente. Eventos sandbox sem autorização são ignorados. Em TRANSFER, cada lado reconcilia seu próprio estado e ambiente; a autorização não é transferida. O registro usa `PER_CUSTOMER` quando envolve políticas diferentes. Foi confirmado que `revenuecat_webhook_events.environment` não possui CHECK limitando os valores.
- O corpo anterior de `apply_revenuecat_snapshot` foi preservado em função privada sem execução direta para `service_role`. O novo wrapper público aplica a política e depois chama esse corpo, mantendo a ordenação de snapshots e a proibição de misturar ambientes.
- Cancelamento, vencimento ou transferência com resposta REST vazia conserva a identidade `app_store` do teste, sem acesso ativo; uma compra posterior pode ser reconhecida enquanto a autorização continuar válida.

Ao expirar, revogar ou trocar o dono, não são concedidos novos acessos sandbox. Uma sincronização que já recebeu autorização no statement pode terminar; não há promessa de revogação instantânea. A autorização é conferida novamente na gravação SQL, e as alterações usam a ordem de locks **advisory da assinatura → customer/equipe**. Não há espera por lock da allowlist em ordem inversa.

Um acesso sandbox já confirmado permanece sujeito ao timestamp de expiração da compra. Se existe histórico sandbox, a mudança para produção exige encerramento/reset controlado do teste; não há conversão automática em contrato pago nem remoção automática de contrato real. A exceção é destinada à equipe de teste indicada, não à conta de produção geral.

## Validação

- **33 checks PostgreSQL/PGlite**: padrão produção, cliente desconhecido, acesso service-only, nenhum plano concedido pela inscrição, dono incorreto, prazo máximo, Apple permitido, Stripe/null ativo negados, proibição de substituir contrato real, mudança de dono, revogação, expiração e sequência compra → vazio/transferência → nova compra.
- **39 testes Deno**: webhook/sync com HTTP interceptado, ambiente por cliente, transferência entre políticas, Stripe sandbox bloqueado e preservação do portal Stripe de produção. Nenhuma chamada financeira real nos testes.
- **163 verificações integradas de migrações**, incluindo exclusão de conta e permissões, aprovadas; typecheck aprovado.
- Preflight remoto executou a migração e a inscrição em transação terminada com **ROLLBACK**. A seleção confere com um único cliente/equipe/dono; estado atual gratuito e sem compra no banco; consulta autenticada ao RevenueCat confirmou ausência de compra real ativa. Não houve inscrição persistente durante o preflight; a aplicação posterior está registrada abaixo.
- Endpoints `revenuecat-webhook` e `revenuecat-sync` rejeitaram chamadas sem autenticação com `401`. Esses checks não enviam eventos nem compram produtos.

## Artefato revisado e aplicação realizada

Pipeline: `scripts/lojas/publish-revenuecat-test-policy.py`. Ele utiliza os helpers de hash, backup, troca atômica e saúde de `publish-consent-backend.py`, sem mudar esse pipeline anterior.

Preflight final:

- Artefato privado: `/private/tmp/maislouvor-apple-sandbox-cca827d.json`.
- SHA-256: `f941a9482e9d54f0021e3e4232171e91f1ed28ab00fbe09585dbb63a06be7189`.
- Commit das fontes: `cca827d`.
- SQL SHA-256: `b8d2fb9c0a84d2f92c3555a23151428ecdd99fc04d505879e0dfb52a223def32`.
- Transação de ensaio: `ROLLBACK`, 0,31 s; fontes e SQL idênticos à revisão aprovada.
- Escopo: um cliente, 14 dias contados da aplicação, App Store somente.
- Aplicação autorizada pelo coordenador e concluída com sucesso em 08/10/2026 às 21:43:55 BRT.
- Exceção válida até 22/10/2026 às 21:43:55 BRT, exatamente 14 dias.
- Nenhum plano foi concedido pela inscrição.

Comando executado após a revisão e a repetição do preflight:

```bash
python3 scripts/lojas/publish-revenuecat-test-policy.py apply \
  --artifact /private/tmp/maislouvor-apple-sandbox-cca827d.json \
  --sha256 f941a9482e9d54f0021e3e4232171e91f1ed28ab00fbe09585dbb63a06be7189
```

O apply adquire o lock de deploy e repete a condição de dono/cliente/contrato gratuito e a leitura do RevenueCat. Exige o mesmo baseline de fontes, schema, loader, imagem, mounts e ambiente. Cria dump custom verificado com `pg_restore --list`, cópias privadas dos três arquivos anteriores e manifesto em `/var/lib/maislouvor-deploy/20261009-apple-sandbox` antes da mudança. A migração e a inscrição são confirmadas juntas, incluindo a versão no registro de migrações; o trigger e a verificação transacional impedem inscrição se o contrato tiver mudado. Apenas os três arquivos RevenueCat são trocados e somente o contêiner edge é reiniciado. A configuração global, Stripe, loader e dependências permanecem conferidos por hash.

Verificação adicional somente leitura em 08/10/2026 às 21:44:39 BRT confirmou:

- **Uma autorização total e ativa**, vinculada ao dono selecionado. A política permite `SANDBOX` exclusivamente em `app_store`, sem necessidade de reset.
- Contrato ainda **free/manual**, sem produto, ambiente de compra, entitlements ou acesso ilimitado. Nenhuma compra foi efetuada por este trabalho.
- Migração registrada uma vez; tabela e RPC de política sem acesso por `anon` ou `authenticated`.
- Contêiner edge saudável; os dois endpoints retornam `401` sem autenticação. Runtime, loader, seis dependências e três fontes conferidos; ambiente global continua `PRODUCTION`.
- Seis outros contratos seguem classificados como manuais, sem ambiente RevenueCat. A aplicação não executou atualizações nesses contratos.

Relatórios locais, sem identidades: `/private/tmp/maislouvor-apple-sandbox-applied.json` e `/private/tmp/maislouvor-apple-sandbox-verified.json`. O backup, os originais e a evidência privada permanecem no diretório de release protegido no servidor.

Rollback da **configuração de teste**, sem restaurar banco ou apagar assinatura:

```bash
python3 scripts/lojas/publish-revenuecat-test-policy.py revoke \
  --artifact /private/tmp/maislouvor-apple-sandbox-cca827d.json \
  --sha256 f941a9482e9d54f0021e3e4232171e91f1ed28ab00fbe09585dbb63a06be7189
```

Esse comando marca a autorização como revogada e preserva contratos. Não desfaz uma compra, não remove o acesso já confirmado antes de vencer e não faz restore cego do dump. Falha após commit registra `needs-forward-repair`; os originais servem para análise de recuperação, não para reintroduzir o comportamento antigo automaticamente.

O acordo de apps pagos da Apple passou a Pending User Info após o aceite, e o titular estava completando o formulário fiscal e o banco. Ainda não foi comprovado que as ofertas nativas carregam depois da ativação. Este backend prepara o reconhecimento seguro de uma compra de teste; não resolve por si só as pendências comerciais da Apple.
