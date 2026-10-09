# Etapas de privacidade, backups e screenshots — 08/10/2026

## Estado da entrega

O aviso para computador e a implementação de privacidade estão no checkout `MaisLouvor-lojas`, branch `codex/integracao-lojas-revenuecat`. **Não houve novo deploy do aplicativo, aplicação definitiva das migrações abaixo ou upload ao TestFlight.** As alterações reais no servidor até esta etapa são backups, retenção e SMTP; a publicação coordenada do aplicativo está em preparação.

Filipe confirmou nesta sessão que Google, Apple e Face ID funcionaram no iPhone. RevenueCat permanece aguardando teste no próximo beta. Não usar o script antigo `ios-internal-testflight.mjs` para esse beta: ele usa uma base anterior que não contém esta integração.

## 1. Aviso e privacidade

- Commit `aa393bc`: líderes recebem orientação “Continue pelo computador” ao criar repertório/nova música. Dentro do repertório, adicionar preserva a busca no acervo e explica como cadastrar pela web.
- Consentimento individual específico, caixa desmarcada, antes de montar os componentes de equipe. Erro de rede bloqueia esses componentes e permite tentar novamente. OAuth/Face ID/termos/líder não concedem o consentimento em nome da pessoa.
- Escolha com versão e data do servidor, tabela privada com histórico, RPC autenticada sem parâmetro para escolher outra pessoa. Consulta ao estado de terceiros usada nas políticas fica em schema privado.
- Retirada em `/minha-privacidade`: limpa caches de equipe, impede novo uso operacional, escalas e avisos, revoga o uso pessoal pelo Asafe (preserva a ativação administrativa da equipe); não apaga a conta automaticamente. Suporte, exclusão e preparação da transferência de liderança permanecem acessíveis. Não reativa o Asafe ao autorizar equipes novamente.
- Convites passam a gerar links ligados ao e-mail: cada integrante entra/cria a própria conta e escolhe. O limite de integrantes e a opção de contratar vagas do RevenueCat foram preservados. Nenhum convite é enviado automaticamente.
- Escala nominal retirada dos links públicos de culto: o consentimento cobre o compartilhamento dentro da equipe, não a publicação irrestrita dos nomes.
- Asafe e separação local preservados. A autorização adicional do Asafe continua separada.
- Política de privacidade local em versão `2026-10-08`, termos em `2026-10-07`.

### Validação

- TypeScript aprovado; **55 arquivos / 462 testes do frontend aprovados**.
- **27 verificações PostgreSQL** de consentimento; **159 verificações integradas** e hardening de exclusão/moderação/Asafe, inclusive reaplicação idempotente e preservação dos guardas de liderança/propriedade.
- Prévia visual em 440 × 956: orientação e consentimento legíveis, sem seleção prévia da caixa.
- Bundle de loja compilado apenas para QA em `tmp/privacy-qa-dist`. Esse comando não substitui o gate de publicação.
- Migrações ensaiadas contra o schema real dentro de transação com **ROLLBACK**, sem erro e sem concessão de consentimento a usuários reais.
- Seed de revisão: **22 testes unitários e 93 verificações no schema PostgreSQL** aprovados. Versão corrente e origem `review_fixture` explícitas apenas para os personagens recém-criados; não conceder consentimento a pessoas reais.
- Contato de suporte atualizado após o titular confirmar a criação da caixa GoDaddy; **19 testes das páginas/textos legais** reexecutados com sucesso.

### Implantação conjunta pendente

Migrações: `20261003131000_terms_acceptance.sql`, `20261003133000_assistant_ai_consent.sql`, `20261007120000_strict_assistant_consent.sql`, `20261007124000_legal_versions.sql`, `20261008233000_team_data_consent.sql`, `20261008234000_privacy_version.sql`.

Atualizar também `whatsapp-assistant`, `send-push`, `public-culto`, `create-invite` (incluindo `legacy.ts`) e `accept-invite`. Preservar as variáveis e demais funções de produção, o catálogo de cobrança e os guardas de equipe já existentes. Publicar o cliente web coordenadamente: versões antigas não contêm a nova tela de consentimento e podem ter de autorizar primeiro pela web. Não ativar as restrições e deixar somente o cliente antigo disponível.

O seed das contas fictícias de revisão foi atualizado para criar registros sintéticos somente para suas próprias identidades recém-criadas antes dos vínculos. Não foi executado contra produção. Nunca fazer concessão em lote para usuários reais. Revisão jurídica do texto/base e tratamento de menores continua sendo uma avaliação profissional, não uma certificação produzida pelos testes.

## 2. Backups

Backup diário criptografado ativo na VPS, retenção de 30 dias **no novo repositório gerenciado**, verificação completa de integridade e restauração em contêiner isolado aprovadas. [Procedimentos e limites](../../scripts/backup/README.md).

Hostinger confirmada na conta: duas cópias semanais fora da VPS, no Brasil, de 27/09 e 04/10. Retenção diária independente instalada e executada: 3 snapshots e 42 cópias legadas dentro de 30 dias, zero exclusões. Considerando cópias semanais que incluem backups locais, o ciclo operacional é de aproximadamente 45 dias; falhas e preservação da última recuperação são descritas explicitamente. [Evidência e procedimentos](retencao-backups-20261008.md).

A cópia temporária no NVMe foi comparada integralmente por SHA-256 após o SMTP (286 arquivos, 4.837.176.006 bytes) e removida após a validação. Relatório e arquivos de compilação preservados. Nenhum plano pago foi contratado.

## 3. Páginas públicas e e-mail

Titular confirmou **E-mail Profissional GoDaddy** e a criação de `suporte@maislouvor.com`. Contato de suporte atualizado no código; o contato de privacidade permanece no Outlook até a segunda caixa funcionar. Sugestão: `privacidade@maislouvor.com`.

DNS MX aponta para GoDaddy. SMTP `smtpout.secureserver.net:465`, TLS verificado, autenticação validada e configuração aplicada por `scripts/lojas/configure-smtp.py --apply`. Apenas auth foi recriado e ficou saudável; OAuth e confirmação automática existentes preservados. Ambiente remoto protegido com permissão 600, backup privado antes da alteração. Nenhum e-mail foi enviado; entrega na caixa de entrada ainda não testada.

O último marcador de retenção foi substituído pelos critérios realmente instalados e verificados. Gate de placeholders aprovado; isso não equivale a revisão jurídica profissional ou autorização de músicas.

## Screenshots e autorização musical

[Quatro prévias JPEG em 1320 × 2868 e evidências de QA](screenshots/previa-20261008/README.md), com dados fictícios, sem envio à Apple. Comparar com o binário nativo final antes do upload. A diferença de login apontada pelo titular foi confirmada: site com layout anterior, TestFlight 6 com carrossel aprovado; não reverter o carrossel.

[Modelo de solicitação de autorização musical](modelo-solicitacao-autorizacao-musical.md). Não é licença concedida; ninguém foi contatado. O titular precisa das permissões correspondentes à composição, gravação e usos do app, inclusive separação, além das condições da plataforma de origem.

## Compilação no NVMe

O Mac ficou com aproximadamente 3 GB livres. Caches `DerivedData` gerados por este trabalho foram removidos; archives de versões enviadas foram preservados. Titular autorizou usar o NVMe **Extreme SSD**. Como ele usa ExFAT, foi criado um arquivo de disco expansível APFS (máximo 80 GB, sem formatar o SSD) em `/Volumes/Extreme SSD/MaisLouvor-builds/MaisLouvorBuild-20261008.sparsebundle`, montado em `/Volumes/MaisLouvorBuild`.

Compilação nativa **Debug para dispositivo, sem assinatura, aprovada** no NVMe, incluindo RevenueCat. Fontes/pacote de QA em `Validation-20261008`, caches em `DerivedData` e `SwiftPackages`, temporários em `Temp`. Log `Validation-20261008/native-build.log`. Isso valida a compilação, não é archive distribuído. O bundle de QA precede a atualização final do endereço de suporte. O último TestFlight confirmado no histórico continua sendo 1.0.0 (6); não afirmar disponibilidade de outro build sem consultar o App Store Connect.
