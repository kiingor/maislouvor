# Correções de conformidade — 7 de outubro de 2026

> **Escopo corrigido em 07/10:** somente sugestões de músicas por IA e importação do Moises foram retiradas. Asafe e separação local de faixas permanecem; as três rotas adicionais desativadas na etapa anterior foram restauradas ao estado anterior. Consulte [a correção e as verificações](preservacao-asafe-faixas-20261007.md). As etapas anteriores abaixo são históricas.

Implementadas no checkout `MaisLouvor-lojas`, branch `feat/conformidade-lojas`, sobre `2ae6be8`. Assinaturas/RevenueCat e limites de plano continuam na outra sessão/branch, conforme solicitado. Na conclusão da implementação, nada deste lote havia sido aplicado à produção ou enviado ao TestFlight.

**Continuação em 07/10:** [backend Apple configurado](backend-conformidade-20261007.md) e, depois, [exclusão e moderação publicados e validados](backend-exclusao-moderacao-20261007.md). SMTP adiado por Filipe. Dados jurídicos, consentimentos de IA, frontend e novo TestFlight continuam pendentes; consulte esses registros antes de executar o roteiro abaixo.

## Implementado

- **Exclusão de conta:** o dono legado de uma equipe sem líderes agora escolhe um sucessor dentro do app. Uma RPC exclusiva de `service_role` confere proprietário, sucessor e ausência de líderes em transação. Os guardas de privilégios de produção continuam intactos; membros não podem promover a si mesmos. A exclusão continua confirmada por `EXCLUIR`, com transferência prévia quando necessária e proteção contra apagar a equipe de outras pessoas.
- **Apple:** o código de autorização do login nativo é trocado no servidor; o ID token é validado com as chaves da Apple e comparado à identidade autenticada no Supabase. O refresh token fica criptografado com AES-GCM, vinculado ao usuário, em tabela sem acesso do cliente. A exclusão revoga o token antes de apagar os dados. Uma falha da Apple preserva a conta para nova tentativa. Contas antigas sem token continuam podendo excluir; a tela de conclusão explica como revogar nos Ajustes da Apple, conforme TN3194. O app também trata notificações nativas de revogação, incluindo sessão protegida por Face ID.
- **Asafe:** remoção do período de tolerância para usar dados sem consentimento. Só o aceite atual libera os dados; alterar o prazo antigo não reabre acesso. O handler bloqueia chamadas à IA quando o consentimento da equipe está ausente, pendente, bloqueado ou não concedido.
- **IA de repertório/cifras:** aviso por solicitação, com provedor, país, retenção, dados e finalidade. Recusar ou fechar a tela não envia o conteúdo. O servidor exige sessão válida e a versão atual do aviso, vinculada também à rota/modelo configurados. Mudanças de provedor invalidam telas antigas. Sem informações de privacidade configuradas, o recurso falha de forma segura. Inclui sugestões, importação do Moises, importação de cifras e sincronização de letras; transposição local continua local.
- **Denúncias:** músicas e respostas de IA podem ser denunciadas no app. Há fila privada em `/admin/denuncias`, aviso à moderação, limite por usuário e histórico administrativo. Apenas a moderação pode concluir ou descartar denúncias. A evidência de IA é o texto fornecido por quem denuncia, não um log autenticado do modelo.
- **Retirada de músicas:** o administrador pode bloquear uma música após analisar a denúncia. A RLS impede novas consultas e URLs assinadas de seus arquivos; as funções de culto/repertório público também a filtram. Arquivos já baixados e URLs assinadas emitidas anteriormente não são revogados retroativamente; as URLs atuais usam validade de até uma hora. Bloquear uma música não remove automaticamente outras cópias independentes do acervo.
- **Origem e direitos:** registro de fonte, titular/licença/autorização, autor da declaração e data. A tela distingue declaração do usuário de validação jurídica. Nenhum item antigo foi marcado automaticamente como autorizado e nenhuma música foi retirada por esta implementação.
- **iOS:** `PrivacyInfo.xcprivacy` do app declara o uso de UserDefaults com motivo `CA92.1` e está incluído nos recursos do projeto Xcode. Isso não substitui o preenchimento de App Privacy no App Store Connect.
- **Android:** declaração de microfone e ajuste de áudio; o microfone é opcional para instalação. O Capacitor pede autorização quando a pessoa inicia a gravação.
- **Documentos:** Termos/Privacidade passaram à versão `2026-10-07`, com migração correspondente; removidas afirmações sobre tolerância de IA e corrigida a descrição de transposição local. A trava de publicação permanece ativa enquanto faltarem os dados reais.
- **Demo de revisão:** o seed deixa o Asafe disponível para ativação manual com consentimento, sem conectar grupos nem enviar mensagens. Continua necessário preparar a conta real de revisão e um roteiro para demonstrar a integração externa.

## Validação

- TypeScript e ESLint dirigido aprovados.
- Vitest: **371 testes em 44 arquivos**, todos aprovados.
- Banco PostgreSQL/WASM isolado: **128 verificações integradas**, além dos cenários novos de migrações idempotentes, recuperação sem escalada de privilégio, consentimento, RLS, denúncias, origem, retirada de circulação e exclusão com as novas tabelas.
- Asafe: **185 verificações de consentimento** e **94 de fluxo**, incluindo ausência de chamadas à IA com consentimento ausente/pendente.
- Deno: nove funções verificadas; dois testes aprovados para criptografia vinculada ao usuário e proteção do envio à IA.
- Demo: **22 testes do seed** e **90 verificações no banco**. Nenhuma conta real foi criada.
- Compilação local de QA web e iOS Simulator concluída; manifesto conferido dentro do `App.app`. Sem upload à Apple.
- Diálogos reais de IA e denúncia conferidos em Chromium, 440×956 e 1024×1366, sem transbordamento horizontal; cabeçalhos e ações visíveis. Capturas em `tmp/store-fixes-qa/`. Transporte simulado, sem envio de denúncias ou dados a serviços reais.
- `git diff --check` aprovado. O verificador jurídico continua bloqueando o release por **10 campos pendentes**.

Não houve teste físico de microfone Android/Face ID, troca/revogação real de tokens Apple, envio real de IA, avaliação da Apple/Google ou build Android de distribuição. O SDK Android não está configurado neste checkout. Testes de simulação e banco isolado não substituem a homologação em ambiente integrado.

## Configuração necessária antes de publicar

### Apple no backend

| Variável | Conteúdo necessário |
| --- | --- |
| `APPLE_CLIENT_ID` | Bundle ID autorizado para o login nativo (`com.maislouvor.app`) |
| `APPLE_TEAM_ID` | Team ID da conta Apple |
| `APPLE_KEY_ID` | Identificador da chave habilitada para Sign in with Apple |
| `APPLE_PRIVATE_KEY` | Chave privada P8, exclusivamente no servidor |
| `APPLE_TOKEN_ENCRYPTION_KEY` | Chave aleatória de 32 bytes em base64, preservada para descriptografar os tokens existentes |

Não colocar P8/chave de criptografia em variáveis `VITE_*`, repositório, build ou notas. Não rotacionar a chave de criptografia sem migrar os tokens já armazenados. O novo login Apple exige que `apple-auth-token` esteja operacional; publicar só o frontend interromperia esse login.

### Provedor de IA de repertório/cifras

Preencher no backend `AI_PROVIDER_NAME`, `AI_PROVIDER_PRIVACY_URL` (HTTPS), `AI_PROVIDER_COUNTRY` e `AI_PROVIDER_RETENTION`, identificando também o gateway/operador que recebe os dados. Conferir os valores com `AI_BASE_URL`, `AI_MODEL` e os contratos reais. Nenhuma empresa, país ou política de retenção foi presumida a partir do nome do modelo. O Asafe tem seu aviso próprio, separado desses recursos.

### Dados e operação

- Completar responsável, documento, endereço, contatos, encarregado, hospedagem/país, SMTP, retenção de backups e base legal de dados sensíveis em `src/lib/legal.ts`. O pedido de nome e contatos já foi feito neste chat e aguarda resposta.
- Definir quem atenderá suporte e denúncias nos prazos publicados e acompanhar a fila administrativa.
- Documentar direitos sobre letras, composições, gravações, capas e autorização das fontes. Disponibilidade pública e uso religioso sem venda não equivalem a autorização de reprodução/redistribuição. Registro de origem e denúncia reduzem lacunas operacionais, mas **não regularizam o acervo**.
- Concluir/mesclar assinaturas na branch correspondente e homologar compra/restauração, sem misturar deploy parcial desta frente.

## Ordem de integração e publicação

1. Revisar/mesclar os trabalhos concorrentes. Preservar `.env` e mudanças existentes; não usar `db push` genérico em checkout com migrações de outras frentes.
2. Aplicar o preflight de exclusão e as migrações pendentes de 03/10 na ordem já documentada. Aplicar depois `20261007120000_strict_assistant_consent.sql`, `20261007121000_apple_auth_tokens.sql`, `20261007122000_account_deletion_recovery.sql`, `20261007123000_content_reports_and_provenance.sql` e `20261007124000_legal_versions.sql`. Conferir `account_deletion_blocking_references()` vazio **após todos os merges**.
3. Configurar os segredos e publicar em conjunto: `apple-auth-token`, `delete-account`, `ai-disclosure`, `suggest-culto-songs`, `import-moises`, `import-cifra`, `sync-lyrics`, `whatsapp-assistant`, `public-playlist` e `public-culto`. Preservar os requisitos de autenticação; os dois endpoints públicos continuam filtrando conteúdo moderado.
4. Homologar login Apple, exclusão normal/legada, recuperação de equipe, denúncias, bloqueio de música, consentimentos e revogação. Preparar conta de revisão e serviços externos disponíveis.
5. Completar os documentos, executar `npm run build:store` e publicar o site completo; conferir conteúdo real de `/privacidade`, `/termos`, `/suporte` e `/excluir-conta`, não apenas HTTP 200.
6. Gerar um build completo da branch integrada e validar iPhone/iPad e Android. **Não reutilizar o snapshot interno antigo** de `scripts/ios-internal-testflight.mjs`: ele foi feito sobre uma base que omite a conformidade. O build de distribuição deve incluir este código e o backend correspondente.
7. Preencher as declarações das lojas, enviar o novo build de teste e só depois preparar a revisão pública. O último TestFlight confirmado nesta sessão continua **1.0.0 (6)**; estas correções ainda não estão nele.

## Referências oficiais

- [Apple — exclusão de conta](https://developer.apple.com/help/app-review/guideline-reference/5-1-1-account-deletion)
- [Apple — revogação e contas antigas sem token, TN3194](https://developer.apple.com/documentation/technotes/tn3194-handling-account-deletions-and-revoking-tokens-for-sign-in-with-apple)
- [Apple — revogação pelo usuário](https://support.apple.com/pt-br/102571)
- [Apple — APIs que exigem motivo declarado](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api)
- [Apple — direitos de terceiros, seção 5.2](https://developer.apple.com/app-store/review/guidelines/#intellectual-property)
- [Google Play — propriedade intelectual](https://support.google.com/googleplay/android-developer/answer/9888072?hl=pt-BR)
