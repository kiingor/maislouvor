# Preparação do backend — 7 de outubro de 2026

> **Escopo corrigido em 07/10:** somente sugestões de músicas por IA e importação do Moises foram retiradas. Asafe e separação local de faixas permanecem; as três rotas adicionais desativadas na etapa anterior foram restauradas ao estado anterior. Consulte [a correção e as verificações](preservacao-asafe-faixas-20261007.md). As etapas anteriores abaixo são históricas.

> **Continuação:** Filipe adiou o SMTP. Depois desta etapa inicial, o backend de
> exclusão e moderação foi publicado e passou por 101 verificações integradas.
> Consulte o [estado atualizado e as pendências](backend-exclusao-moderacao-20261007.md).
> O texto abaixo preserva o registro da configuração inicial Apple.

Continuação autorizada por Filipe após a [implementação de conformidade](correcoes-conformidade-20261007.md). Checkout `MaisLouvor-lojas`, branch `feat/conformidade-lojas`. A implementação de assinaturas continua no checkout/fluxo paralelo; não houve merge, commit ou push.

## Ativado nesta etapa

- Criada uma chave **Sign in with Apple**, restrita ao App ID `com.maislouvor.app` da equipe Apple já configurada. A chave foi baixada e guardada fora do repositório, em diretório privado (0700), arquivo 0600. As chaves de App Store Connect/assinaturas existentes não foram reutilizadas.
- No Supabase auto-hospedado, aplicada **somente** `20261007121000_apple_auth_tokens.sql`: tabela privada, RLS habilitada, sem acesso de `anon` ou `authenticated`. Não houve exclusão ou modificação de contas.
- Publicados **somente** `apple-auth-token/index.ts` e `_shared/appleTokens.ts`. O novo endpoint recebe o código após o login nativo e prepara o armazenamento criptografado do token Apple.
- Configuradas as cinco variáveis `APPLE_*` documentadas na implementação, em `/opt/supabase/.env.apple-signin` (0600). A chave AES foi gerada no servidor; não está no frontend nem nos registros. O Compose passou a carregar esse arquivo apenas no serviço `functions`.
- Recriado apenas `supabase-edge-functions`, sem atualizar imagem. Comparação da configuração resolvida aceitou somente as cinco variáveis novas; todas as variáveis anteriores do processo foram preservadas. Os hashes das funções existentes permaneceram iguais.
- Backup privado do Compose anterior, schema e metadados da aplicação em `/var/lib/maislouvor-deploy/20261007-apple-signin/`. Preservar o arquivo de segredos: trocar a chave AES sem migrar tokens impede descriptografá-los. Nenhuma cópia desses segredos deve entrar no Git ou BrainHub.

**Isso não é a publicação de toda a conformidade.** `delete-account` e as demais funções/migrações continuam pendentes. A revogação durante a exclusão depende desse próximo lote; a nova troca de token ainda precisa ser homologada com login real no iPhone.

## Verificações realizadas

- Criado `scripts/lojas/preflight-remote.py`: lista explícita das nove migrações, mesmo bloqueio de deploy da VPS, limite de locks/consultas, duas aplicações em uma transação com `ROLLBACK`. Não usa `db push`, dados de demonstração nem mensagens externas.
- Rodado no banco real antes e depois da ativação Apple: **duas passagens aprovadas em cada execução**, incluindo reaplicação, referências de exclusão vazias, guarda de proprietário preservado, versões jurídicas, consentimento estrito e permissões das RPCs/tabela Apple. Impressões da estrutura antes/depois iguais; a transação de teste não persistiu mudanças.
- Criado `scripts/lojas/deploy-apple-signin.py`, padrão somente conferência; executados preflight e aplicação explícita. Recusa sobrescrever ambiente, tabela, arquivos ou release Apple existente para preservar a chave de criptografia. Não o reexecute com `--apply` para atualizar uma instalação existente.
- A chave assinou um client secret; a Apple retornou `invalid_grant` para um código propositalmente inválido, em vez de `invalid_client`. É apenas uma verificação de configuração, **não** evidência de login, troca de código ou revogação real.
- Endpoint `apple-auth-token` carregou no runtime real e retornou **401** com `unauthorized` para chamador sem usuário válido. Tabela sem leitura de clientes, RLS ativa; serviço saudável.
- Auth, functions, banco, REST e Storage saudáveis após a implantação. Saúde e configurações do GoTrue: HTTP 200, Apple/Google/e-mail ativos. Site: HTTP 200. Não houve troca do site ou do app distribuído.
- Sintaxe Python e `git diff --check` aprovados. Os 371 testes e o build de iOS da etapa anterior não foram repetidos, pois o código do app não mudou nesta continuação.
- Evidências locais sem segredos: `tmp/store-backend-qa-20261007/`, incluindo o preflight posterior em `after-apple/`.

## Pendências confirmadas no ambiente

1. **E-mail:** GoTrue aponta para `supabase-mail:2500`, mas esse host não resolve dentro do container de autenticação e não há serviço de e-mail na rede dele. Isso impede usar esse destino para recuperar senha. O cadastro atual confirma e-mail automaticamente; essa configuração foi preservada. Não foi disparado e-mail de teste. Foi solicitado o provedor/configuração real, sem pedir senha no chat.
2. **IA de repertório/cifras:** `AI_BASE_URL` aponta para `https://iarouter.softcomia.com/v1`, modelo `cerebras/gpt-oss-120b`; as quatro variáveis `AI_PROVIDER_*` estão ausentes. Foi solicitado identificar o operador, política, países e retenção. Não presumir que o nome do modelo identifica todos os responsáveis pelo tratamento.
3. **Jurídico:** o verificador continua encontrando dez campos em `src/lib/legal.ts`. O pedido de identificação e contatos continua aguardando resposta. A chave/conta Apple não autoriza copiar dados pessoais do cadastro para páginas públicas.
4. **Integração:** faltam as demais migrações e funções, publicação dos documentos, homologação de consentimentos/exclusão/moderação e integração das assinaturas pelo fluxo definido por Filipe. Ativar o bloqueio estrito do Asafe sem entregar sua interface de consentimento impediria os grupos atuais de usar o recurso; coordenar banco, funções e frontend.
5. **Distribuição:** nenhum archive novo foi enviado. O último TestFlight confirmado anteriormente é **1.0.0 (6)**. A automação permanece pausada. Não usar o gerador do snapshot antigo para publicar esta versão completa.

## Continuação

Resolver dados jurídicos, SMTP e avisos da IA; revisar as alterações da integração; repetir o preflight após o merge. A migração da tabela Apple pode permanecer na lista, pois é idempotente. Preservar os segredos já instalados e publicar as demais funções em conjunto com as suas dependências. Depois validar login Apple real, exclusão/revogação e os demais fluxos, gerar o bundle com `npm run build:store` e enviar uma nova compilação completa ao TestFlight.

Referência: [Apple — criar chave específica para Sign in with Apple](https://developer.apple.com/help/account/capabilities/create-a-sign-in-with-apple-private-key/).
