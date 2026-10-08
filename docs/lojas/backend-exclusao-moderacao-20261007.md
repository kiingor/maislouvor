# Backend de exclusão e moderação — 7 de outubro de 2026

> **Escopo corrigido em 07/10:** somente sugestões de músicas por IA e importação do Moises foram retiradas. Asafe e separação local de faixas permanecem; as três rotas adicionais desativadas na etapa anterior foram restauradas ao estado anterior. Consulte [a correção e as verificações](preservacao-asafe-faixas-20261007.md). As etapas anteriores abaixo são históricas.

Filipe pediu continuar e **adiar o serviço de e-mail**. O SMTP não foi alterado e não é requisito para concluir esta etapa do backend. A recuperação por e-mail continua pendente para uma etapa futura. O trabalho permanece no checkout `MaisLouvor-lojas`, branch `feat/conformidade-lojas`; assinaturas continuam com a outra sessão, sem merge ou alterações neste trabalho.

## Publicado no servidor

### Exclusão de conta

Aplicadas, em transação, somente `20261003130000_account_deletion.sql` e `20261007122000_account_deletion_recovery.sql`. A tabela/chaves Apple da etapa anterior foram preservadas. Publicados `delete-account/index.ts` e `flow.ts`, sem reiniciar serviços. A exclusão usa o usuário autenticado e confirmação explícita; equipes compartilhadas exigem resolver a propriedade/liderança. Donos antigos sem liderança podem escolher um sucessor membro da própria equipe pela função autenticada.

Os guardas de líder e proprietário já existentes permaneceram intactos. A migração altera as referências de autoria para manter o conteúdo das equipes e impedir exclusão da equipe junto com um proprietário que ainda tenha outras pessoas nela. A revogação Apple está no endpoint, mas continua dependendo da homologação de um login Apple real com o cliente atualizado.

Script: `scripts/lojas/deploy-account-deletion.py`, conferência por padrão e aplicação explícita. Backup completo do banco em formato custom, manifesto e resultados privados no servidor em `/var/lib/maislouvor-deploy/20261007-account-deletion/`. Não repetir esse instalador sobre uma instalação existente.

### Moderação e origem de músicas

Aplicadas `20261003132000_chat_moderation.sql` e `20261007123000_content_reports_and_provenance.sql`, com conferência de dependências, permissões e referências da exclusão. O backend agora oferece denúncias privadas de chat/músicas/IA, bloqueios pessoais, análise administrativa, suspensão de contas autorizada e registro de origem/autorização das músicas. O filtro de palavras vale para novas mensagens e avisos; não houve edição em massa do histórico.

Publicados `platform-suspend-account`, `send-push`, `public-playlist` e `public-culto`. Os endpoints públicos filtram músicas marcadas pela moderação. Antes de substituir as funções existentes, foram comparadas com a produção; as diferenças eram as correções esperadas, além de finais de linha. O instalador exige os hashes conferidos e recusa uma base que tenha mudado.

Reiniciado somente o container `supabase-edge-functions`, sem alterar imagem, ambiente ou Compose. Nenhuma conta real foi suspensa, nenhum item do acervo real foi bloqueado e nenhum push de teste foi disparado. O registro de origem não regulariza automaticamente direitos autorais.

Script: `scripts/lojas/deploy-moderation.py`, conferência por padrão e aplicação explícita. Backup completo do banco, fontes anteriores e manifestos em `/var/lib/maislouvor-deploy/20261007-moderation/`, restritos ao servidor. Em falha das funções, o script restaura as fontes anteriores; as migrações aditivas permanecem, preservando os dados.

## Validação no ambiente integrado

`scripts/lojas/qa-account-deletion.py` cria contas temporárias identificadas, sem e-mail, usando a Admin API; faz login real por senha e testa as chamadas como usuários comuns. Senhas/tokens ficam na memória do servidor. Os IDs exatos são registrados privadamente para recuperação em caso de interrupção. A limpeza valida os marcadores e nunca escolhe contas existentes para excluir.

Primeira execução, após exclusão: **83 verificações aprovadas**. Depois da moderação, execução ampliada: **101 verificações aprovadas**, incluindo:

- Confirmação obrigatória, bloqueio da exclusão do dono de equipe compartilhada e rejeição de `user_id` alheio no corpo da requisição.
- RPC de recuperação inacessível ao cliente; invasor e sucessor fora da equipe recusados. Transferência válida promove o sucessor e libera a saída do antigo dono.
- Exclusão do Auth, perfil, equipe de membro único e avatar no Storage; fila de arquivos esvaziada. Repetir a chamada não afeta outras contas.
- Equipe compartilhada e suas músicas mantidas após a exclusão do autor, com autoria desvinculada.
- Fila de denúncias invisível ao usuário comum, gravação direta recusada e suspensão administrativa recusada a quem não é administrador.
- Origem de composição sintética registrada pelo proprietário; usuário comum não consegue alterar o campo de moderação.
- Música sintética aparece nos links públicos de culto/repertório antes do bloqueio e desaparece depois dele. O bloqueio também impede sua leitura pelo membro comum.

As duas execuções removeram suas três contas, duas equipes e avatar de teste. Conferência final independente: **zero contas/equipes de QA restantes e zero referências que bloqueiam a exclusão**. A verificação de denúncias limitou-se às permissões; não foram criadas denúncias de teste que notificariam os moderadores reais. Não houve envio de e-mail, push ou mensagem WhatsApp.

`scripts/lojas/preflight-remote.py` ganhou os escopos `account-deletion` e `moderation`: ambos passaram duas vezes em transações com rollback antes da aplicação. O escopo completo das nove migrações passou novamente após ambos os deploys, com duas passagens e estrutura idêntica antes/depois do teste. As migrações pendentes não foram persistidas por essa conferência.

Auth, functions, PostgreSQL, REST e Storage saudáveis ao final. GoTrue saúde/configurações HTTP 200; Apple/Google/e-mail continuam habilitados. Sintaxe Python e `git diff --check` aprovados. Evidências sem credenciais: `tmp/account-backend-qa-20261007/`. Os testes anteriores do app e o build iOS não foram repetidos, pois o código do cliente não mudou nesta continuação.

## O que ainda falta para o beta completo

- Dados jurídicos reais: os dez campos em `src/lib/legal.ts` continuam pendentes. Configurar SMTP foi adiado; isso não fornece automaticamente identidade do responsável, contatos públicos ou as demais decisões jurídicas.
- Somente sugestões de músicas e Moises foram retirados. As rotas legadas restantes voltaram ao estado anterior; qualquer futura exposição delas na interface deve retomar a revisão do provedor e do consentimento. Asafe e Demucs são independentes dessa integração.
- Termos/privacidade e consentimento estrito do Asafe devem chegar junto com a interface correspondente. Continuam pendentes `20261003131000_terms_acceptance.sql`, `20261003133000_assistant_ai_consent.sql`, `20261007120000_strict_assistant_consent.sql` e `20261007124000_legal_versions.sql`, além da atualização do Asafe.
- Publicar o frontend com os documentos definitivos, integrar as assinaturas pelo fluxo escolhido por Filipe e homologar login/revogação Apple no aparelho.

**Nenhum novo build foi enviado ao TestFlight.** O último confirmado nesta sequência continua 1.0.0 (6). O app distribuído ainda não contém as telas de conformidade; as mudanças desta etapa estão no servidor. Não reutilizar o snapshot interno antigo para montar o beta completo. Nenhum commit, push, merge ou envio à revisão pública foi feito.
