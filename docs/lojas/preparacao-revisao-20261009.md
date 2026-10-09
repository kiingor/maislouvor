# Preparação da revisão enquanto o teste físico está adiado — 09/10/2026

## Resultado e limites

Foram preparados os metadados/notas de revisão, auditadas as páginas públicas e
capturas, corrigida localmente a composição dos textos de backup e criada a conta
fictícia da Apple. Uma migração pendente do cadastro já presente no frontend foi
aplicada ao banco, com backup e verificações transacionais.

**Não houve novo TestFlight, envio para revisão pública ou gravação de metadados
no App Store Connect.** A ficha de Apps não carregou de forma confiável no Safari;
não considerar os textos locais como salvos na Apple. O build interno continua
**1.0.0 (9)**, fonte `26013cc`. A preferência de manter a conta Apple pessoal
conectada foi preservada.

O erro `ML-IOS-OFFERINGS-23-BRA` continua pendente. Preparar a revisão não valida
carregamento de produtos, compra, restauração ou liberação da assinatura.

## Conta Apple para a revisão

- Inspeção anterior à criação: zero contas para os cinco e-mails reservados e
  nenhuma credencial local. Nenhum usuário existente foi reaproveitado/resetado.
- Executado `node scripts/review-demo/seed.mjs --apply --yes --store apple`.
- Cinco personagens marcados `review_demo`; equipe com seis músicas, cinco
  stems, um repertório, dois cultos futuros, onze mensagens e onze áudios.
- Credencial apenas em `~/.local/share/maislouvor-review/credentials.json`, modo
  `0600`, diretório privado. Não foi incluída em Git, BrainHub ou screenshots.
- Login por senha validado pela API com chave pública e sessão do usuário,
  seguido de consultas sujeitas às próprias políticas de acesso: proprietário,
  cinco integrantes, seis músicas no catálogo, cinco faixas e demais contagens.
- Os onze áudios tiveram URLs assinadas geradas pela própria sessão e responderam
  HTTP 200 com conteúdo não vazio. Isso valida acesso ao arquivo, não reprodução
  audível no iPhone. A sessão de validação foi encerrada.
- Banco confirmou `plan=free`, `status=free`, `provider=manual`, limite cinco e
  `is_unlimited=false`. A equipe já ocupa as cinco vagas; não houve concessão de
  assinatura, exceção sandbox, convite nem envio de e-mail.
- O primeiro acesso ainda solicita os termos. Os consentimentos de participação
  são fixtures explicitamente marcadas, somente dos personagens. Não foi dado
  aceite opcional de IA em nome de pessoa real.
- Asafe disponível para ativação manual, sem grupo conectado e sem avisos
  automáticos. A demonstração WhatsApp completa depende de grupo controlado.
- A conta Google não foi criada nesta etapa. Não resetar a conta Apple durante
  uma revisão em andamento.

Ainda falta conferir a navegação no binário final. Os stems são arquivos de
demonstração licenciados; não comprovam uma nova execução do worker Demucs.
No app, o caminho da separação é repertório → música → **Ensaio → Gravação →
Separar em faixas (IA)**. O modo somente leitura da gestão não elimina essa ação.

## Migração pendente encontrada e aplicada

O preflight do seed parou antes de qualquer gravação: `songs` não tinha
`is_draft`, `recording_source_url`, `audio_revision` e `draft_repertorio_ids`.
Consultas diretas ao PostgreSQL confirmaram ausência real, inclusive das funções
do catálogo; não era apenas cache do PostgREST.

Foi aplicada somente `20260930200000_song_registration_catalog.sql`, idêntica à
fonte publicada `26013cc`. SHA-256:
`f027c0b7ae3f64f850087fc8b997a80cdf21bb4b87c4ee3e7c78fc9ff5e69367`.

Verificações e implantação:

1. Pré-requisitos confirmados: tabelas/colunas de importação e anexos,
   `member_can`, RLS e unicidade de repertório/música. Sem overrides posteriores
   das funções/trigger desta migração.
2. Testes existentes: **22 testes do seed** e **93 verificações PGlite** passaram.
3. Ensaio no banco com `ROLLBACK`, incluindo leitura das RPCs sob `authenticated`
   e com uma identidade autorizada; não retornou conteúdo dessa conta ao log.
4. Lock exclusivo de implantação, dump custom privado e índice do dump conferido
   por `pg_restore --list`. Transação com `lock_timeout=3s`,
   `statement_timeout=60s` e `ON_ERROR_STOP`.
5. Hashes dos registros anteriores à alteração confirmaram **277 músicas e
   600 faixas preservadas**. Quatro colunas, cinco índices, trigger, funções
   invoker e grants verificados antes do commit; nenhuma política RLS alterada.
6. Registro exato da versão/SQL em `supabase_migrations.schema_migrations`,
   reload do PostgREST e preflight do seed aprovado antes de criar a demo.

Backup/manifesto/estado remoto privado:
`/var/lib/maislouvor-deploy/20261009-song-catalog-review`.
Artefatos locais sem segredos (migração congelada, executor e resultados):
`/Volumes/MaisLouvorBuild/Review-Preparation-20261009`.
Não reaplicar todo o histórico com `supabase db push`: o registro histórico
anterior é parcial. Não restaurar o dump automaticamente sobre dados novos.

Comportamento já previsto pelo cadastro publicado: a busca exige nome, artista,
tom, tema, cifra e áudio. **66 de 277 músicas existentes** atendiam a esse critério;
as demais permanecem salvas e nos repertórios, mas não entram nessa busca para
novas adições enquanto incompletas. A implantação não preencheu nem removeu
conteúdo dos usuários.

Limitação confirmada para acompanhamento: trocar efetivamente `audio_path` ou
`audio_revision` invalida as linhas de faixas anteriores, inclusive manuais.
Esse trigger não cancela jobs em andamento, e o callback não compara a revisão
da gravação. O DDL não disparou essa invalidação; troca de áudio durante uma
separação em execução merece teste/correção própria antes da versão pública.

## Ficha da loja, páginas e capturas

- `app-store/metadata-pt-BR.json` e `notas-revisao.md` foram alinhados às
  assinaturas, plano gratuito, gestão musical na web, consentimentos, Asafe e
  separação. A declaração antiga de ausência de compras foi removida.
- Notas incluem preparação de App Privacy para histórico de compras e User ID
  vinculados, com fontes Apple/RevenueCat e evidência do ID associado à equipe.
  Ainda é necessário conferir o questionário completo na Apple; isto não é
  declaração de conformidade jurídica ou aprovação da loja.
- `/termos`, `/privacidade`, `/suporte`, `/excluir-conta` e `/login` responderam
  HTTPS 200 e foram conferidos renderizados. Carregam o pacote da fonte `26013cc`.
  O login público já usa o carrossel aprovado; a nota histórica de login antigo
  no README das capturas foi atualizada.
- Corrigida **somente localmente** a inserção de `BACKUP_RETENTION` nas páginas
  de privacidade/exclusão. O parágrafo agora aparece separado, sem construções
  como “por Backups diários...” ou “em até Backups diários...”. Os prazos não
  mudaram. Typecheck e inspeção visual das duas páginas passaram, sem erro JS.
  Essa correção ainda precisa da próxima publicação web/nativa.
- Quatro JPEGs 1320×2868/sRGB/sem transparência conferidos. Continuam sendo
  prévias de componentes com personagens, não screenshots do binário 9.
  Recapturar 02/03 sem scrollbar do navegador; carregar áudio e enquadrar o
  mixer na 03, que ainda mostra `0:00` e parte inferior cortada.
- Faltam capturas iPad de 13″, pois o projeto mantém suporte `1,2`; conferir os
  slots exigidos na ficha. Nenhuma imagem foi enviada nesta etapa.

## Pendências antes do envio público

- Resolver catálogo Apple no dispositivo e testar compra, restauração e acesso,
  mantendo a conta pessoal conectada; o build de desenvolvimento já está
  preparado conforme o diagnóstico anterior.
- Validar assinatura para a conta de revisão. A exceção sandbox existente é
  específica de outra equipe/prazo e não cobre automaticamente esta demo.
- Validar navegação/demo, separação nova, troca de gravação durante processamento,
  Asafe com grupo controlado e binário elegível para revisão pública.
- Produzir capturas finais iPhone/iPad e dos produtos de assinatura, revisar e
  preencher os campos da Apple, inclusive classificação etária e privacidade.
- Conferir as permissões necessárias para os conteúdos disponibilizados. Gestão
  na web e uso religioso não substituem licenças; autorizações não fornecidas não
  foram presumidas. A demo tem conteúdo original e trecho CC BY 3.0 atribuído.

Referências: [diagnóstico físico](diagnostico-nativo-assinaturas-20261009.md),
[notas de revisão](notas-revisao.md),
[capturas](screenshots/previa-20261008/README.md),
[seed](../../scripts/review-demo/README.md).
