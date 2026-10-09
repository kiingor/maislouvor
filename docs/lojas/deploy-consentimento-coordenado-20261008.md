# Deploy coordenado do consentimento — 8 de outubro de 2026

`scripts/lojas/publish-consent-backend.py` separa a preparação da aplicação. A preparação registrada aqui não publicou o backend e não criou consentimentos. A execução de `apply` é coordenada pelo agente principal com o pacote web que contém a nova escolha de privacidade.

**Aplicação real confirmada:** depois da preparação, o agente principal executou `apply` com o artefato abaixo e recebeu exit code `0`, `deployed=true` e estado `completed`. As sete versões foram registradas no banco, os oito arquivos edge publicados, onze dependências e o loader preservados. As três contagens de consentimento — antes, após as migrações e após a saúde — ficaram em **zero**, tanto para pessoas reais quanto para fixtures. Os cinco checks de saúde passaram; nenhuma notificação foi enviada ou convite criado. Resultado local conferido em `/private/tmp/maislouvor-consent-backend-applied.json`; evidência privada no servidor em `/var/lib/maislouvor-deploy/20261009-consent-backend/result.json`.

A publicação web é uma etapa própria do coordenador; este documento confirma o backend. Os comandos abaixo registram o procedimento usado, não uma autorização para repetir a primeira implantação. O pipeline recusa execução se a tabela de consentimentos já existir.

## Escopo congelado

Sete migrações, nesta ordem, em uma única transação PostgreSQL:

1. `20261003131000_terms_acceptance.sql`
2. `20261003133000_assistant_ai_consent.sql`
3. `20261007120000_strict_assistant_consent.sql`
4. `20261007124000_legal_versions.sql`
5. `20261008233000_team_data_consent.sql`
6. `20261008234000_privacy_version.sql`
7. `20261008235000_assistant_team_data_guard.sql`

O payload registra o conteúdo exato e SHA-256 de cada migração e destes oito arquivos edge:

- `whatsapp-assistant/persona.ts`, `tools.ts` e `handler.ts`;
- `send-push/index.ts` e `public-culto/index.ts`;
- `create-invite/index.ts`, `create-invite/legacy.ts` e `accept-invite/index.ts`.

As onze dependências já iguais à produção permanecem intocadas e são novamente conferidas por hash, assim como `main/index.ts`. O baseline também contém a impressão digital do esquema, imagem, comando, montagem e ambiente do contêiner. As variáveis do ambiente nunca saem do servidor; somente o hash do conjunto é registrado. A ordem de mounts retornada pelo Docker é normalizada antes do hash porque pode variar sem mudança real.

## Preparação e aplicação

```bash
python3 scripts/lojas/publish-consent-backend.py prepare \
  --release-id 20261009-consent-backend \
  --baseline /tmp/maislouvor-functions-baseline.json \
  --output /tmp/maislouvor-consent-backend-final.json
```

`prepare` adquire `/var/lock/maislouvor-deploy.lock`, confere o baseline, aplica as sete migrações terminando com `ROLLBACK`, confirma que a produção permaneceu igual e faz cinco chamadas de saúde que não enviam notificações nem criam convites. O artefato local é privado, modo `0600`. No macOS, o caminho real é `/private/tmp/...`.

O preparo final passou em 09/10/2026 UTC, ainda 08/10 em Brasília:

- Commit da fonte: `759eb9b`, incluindo o guard adicional do Asafe.
- Artefato: `/private/tmp/maislouvor-consent-backend-final.json`.
- SHA-256: `d644dfbecbece2bf085b889a8cfe57b928bf802f07833351ad8bf1e8be1f0ca5`.
- Sete migrações em transação de ensaio: **0,234 s**, com `ROLLBACK`.
- Tabela de consentimentos inexistente antes; **zero consentimentos reais ou fixtures**.
- Saúde: Asafe sem segredo `404`; criação/aceite de convite com credencial anônima `401`; culto público e push com corpo vazio `400`.
- Dez testes unitários do pipeline aprovados: escopo, ordem, adulteração, transação, identificador de release, segredo ausente dos relatórios, troca atômica, symlink, falha sanitizada e ordem de mounts.

Aplicação explícita, somente após revisão e coordenação do pacote web:

```bash
python3 scripts/lojas/publish-consent-backend.py apply \
  --artifact /private/tmp/maislouvor-consent-backend-final.json \
  --sha256 d644dfbecbece2bf085b889a8cfe57b928bf802f07833351ad8bf1e8be1f0ca5
```

O `apply` não reconstrói o conteúdo a partir de arquivos locais alteráveis. Ele usa o artefato congelado, exige seu hash exato e compara novamente todo o baseline. Antes da primeira alteração, cria um dump PostgreSQL em formato custom e verifica o índice com `pg_restore --list`, copia os oito originais e grava o manifesto em `/var/lib/maislouvor-deploy/20261009-consent-backend`, com acesso restrito.

As sete migrações são aplicadas juntas com `ON_ERROR_STOP=1`, lock timeout de 5 s e statement timeout de 90 s. Antes do commit, a verificação exige zero concessões automáticas e confere os controles de acesso/versões legais. A mesma transação registra `version`, `name` e SQL efetivamente executado em `supabase_migrations.schema_migrations`. Essa instalação não possuía a tabela: **o registro cobre somente estas sete migrações**, sem inventar histórico anterior. Não usar futuramente `supabase db push` para reaplicar todo o histórico sem reconciliá-lo primeiro.

Após o commit, apenas os oito arquivos revisados são substituídos atomicamente, um a um. O loader existente usa cache de módulos; por isso, reinicia-se exclusivamente `supabase-edge-functions`, mantendo imagem, ambiente e mounts. As dependências, loader e hashes publicados são reconferidos, seguidos pelas cinco verificações de saúde.

O resultado separa as contagens de consentimentos **antes**, **dentro da transação após as migrações** e **após a saúde**. A última leitura pode incluir uma escolha legítima feita por um usuário depois do commit; isso não é classificado como concessão automática da migração. O registro das sete versões também é relido para confirmar a aplicação.

## Coordenação e recuperação

O coordenador deve ter o pacote web pronto antes de aplicar o backend e publicar a interface compatível logo em seguida, acompanhando os resultados. Os clientes antigos podem ficar temporariamente bloqueados pelas novas regras até receberem a interface de consentimento. O tempo de SQL medido foi inferior a um segundo; dump, reinício e carregamento das funções dominam o tempo total. A estimativa operacional inicial foi de 30–90 s, não uma garantia.

- Falha antes do SQL: nenhum arquivo edge foi modificado; investigar o estado privado e preparar novamente com um novo identificador se necessário.
- SQL com erro: `ON_ERROR_STOP` interrompe a sessão e a transação não confirmada é desfeita. Se houver perda de conexão durante o commit, o estado fica incerto até conferência do registro no banco.
- Falha após commit: o estado é marcado `needs-forward-repair`. Não há `pg_restore` automático, reversão automática das restrições ou retorno automático ao edge antigo. Isso evita apagar gravações legítimas ou reativar processamento que agora depende de consentimento. Usar o dump e os originais como evidência para reparo avaliado.
- Depois de aplicação bem-sucedida: conferir `result.json`, `state.json` e o registro de versões. O coordenador registra a publicação efetiva separadamente deste preparo.

Os backups e artefatos de deploy seguem a retenção datada do +Louvor. Nenhuma chave, senha ou conteúdo de `.env` foi incluído no artefato local ou no Git.
