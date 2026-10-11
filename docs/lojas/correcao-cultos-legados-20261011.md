# Músicas ocultas nos cultos antigos — 11/10/2026

## Estado

Correção **implantada no backend** em 11/10. A leitura com as permissões do
usuário confirmou os sete itens do culto de 11/10 com título. Os três originais
e suas dezoito faixas separadas voltaram a passar pela autorização do Storage.
Não há mais referências ocultas nos cultos da equipe afetada.

O ajuste é no servidor e vale para web, Android e iOS já instalados. Não precisa
substituir as músicas nem gerar outro binário para corrigir os nomes.
A compilação iOS **1.0.0 (13)**, com o player nativo, já foi enviada em 09/10;
a disponibilização no grupo Teste iPhone ainda aguarda acesso ao App Store
Connect. Em 11/10, a sessão do Safari expirou ao consultar as compilações e foi
solicitado ao titular que entrasse novamente. Não afirmar que 13 está disponível
antes de conferir o grupo. Ver [registro do áudio](correcao-audio-ios-20261009.md).

## Causa confirmada

O culto `c88b0495-e76a-43f5-b269-ee07fb78869b`, CULTO DE DOMINGO, pertence a
MINISTÉRIO DE LOUVOR - IMJP, equipe `f7c728f0-f2dd-4751-b6a6-0b21180463d4`.
Não confundir com a equipe mais antiga Louvor Metodista, de outro identificador.

Três entradas referenciam músicas de CORAL IMJP - CENTRAL: A Começar Em Mim,
Aleluia, Hosana e Nunca mudarás. Os títulos e arquivos estavam intactos.
Existem nove concessões explícitas em `song_read_shares`, criadas em setembro,
com nove associações a repertório e treze a cultos. Essa estrutura legada estava
na produção, mas não era representada nas fixtures anteriores da biblioteca.
A restrição introduzida em `20261010020000_private_audio_assets.sql` bloqueou
essas músicas compartilhadas; o PostgREST retornava a relação `songs` vazia.
Antes da correção, a leitura com o papel authenticated e a identidade do usuário
reproduziu exatamente os três títulos vazios e a recusa do áudio.

## Correção

`20261011010000_preserve_legacy_song_links.sql` registra uma lista fechada dos
vínculos que existiam antes da ativação da biblioteca privada e tinham concessão
explícita. Reaplicar a migração não amplia a lista. Instalações sem a estrutura
antiga de compartilhamento recebem uma lista vazia.

- Leitura exige vínculo original ainda existente, equipe de origem preservada,
  participação/permissão atual na equipe de destino, consentimento e moderação.
- Os nomes, detalhes, original e stems desses vínculos voltam a ser acessíveis.
  A autorização de áudio confere o caminho exato registrado na música/faixa.
- Remover todos os vínculos ou revogar a concessão retira o acesso. Uma nova
  concessão não entra automaticamente na exceção de compatibilidade.
- Alterar ordem, observações e tom do item antigo é permitido pelos controles
  usuais de edição do culto. Trocar música, recipiente ou ID não amplia o acesso.
- Não permite novas associações entre equipes, edição da música de origem,
  exclusão de suas faixas/arquivos nem descoberta de outra biblioteca.
- Links públicos anônimos continuam sem áudio privado. A exceção de migração
  não declara licenças autorais nem implementa um catálogo compartilhado novo.

## Implantação e preservação

Backup PostgreSQL completo de 1.555.687 bytes, validado com `pg_restore --list`:
`/var/lib/maislouvor-deploy/20261011-legacy-song-links/database.before.dump` no VPS.
O diretório contém `apply.sql`, `apply.log` e o inventário do backup.

A implantação foi transacional e abortaria se os títulos continuassem ocultos,
o original permanecesse bloqueado, a lista diferisse dos 22 vínculos previstos
ou qualquer conteúdo das tabelas preservadas mudasse. Contagem e hash dos
registros completos conferidos antes/depois, dentro da transação:

| Tabela | Registros | Resultado |
| --- | ---: | --- |
| songs | 283 | idênticos |
| song_tracks | 605 | idênticos |
| culto_songs | 130 | idênticos |
| repertorio_songs | 99 | idênticos |

Nenhuma escrita no Storage, importação, reprocessamento Demucs, alteração de
consentimentos reais ou mudança de equipe. Consolidação e limpeza continuam
desativadas. Não houve deploy de frontend nem novo archive neste ajuste SQL.

## Verificações

- `node supabase/tests/audio/legacy-links.test.mjs`: 33 verificações SQL/RLS,
  com reprodução do bug, preservação de dados, nomes/stems/áudio, edição do item,
  bloqueio de novas associações, isolamento, revogação, moderação e reaplicação.
- `node supabase/tests/audio/privacy.test.mjs`: 50 verificações aprovadas.
- `node supabase/tests/lojas_all_migrations.mjs`: 175 verificações e hardening,
  migrações juntas e reaplicadas, incluindo ambiente sem concessões legadas.
- Produção, somente leitura após implantação, com permissões do usuário:
  sete entradas com título, três originais autorizados, 18/18 stems autorizados,
  zero títulos ocultos em todos os cultos da equipe.

Ainda depende de confirmação no iPhone a qualidade sonora do player nativo da
build 13. A verificação do banco/Storage não equivale a ouvir o áudio no aparelho.
RevenueCat e as demais pendências de revisão pública permanecem separadas.
