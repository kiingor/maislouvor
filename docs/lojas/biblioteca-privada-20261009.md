# Biblioteca privada e reaproveitamento de áudio

Estado: implementado na branch `codex/integracao-lojas-revenuecat` e **implantado no servidor e na web em 09/10/2026**. Build iOS 1.0.0 (12) enviada. Consulte o [registro de publicação e QA](publicacao-biblioteca-privada-20261009.md) para o estado confirmado do TestFlight. Não submetido à revisão pública.

## Decisão e proteção do catálogo existente

O usuário autorizou a biblioteca isolada por equipe e o reaproveitamento físico de arquivos. Pediu para manter a importação do YouTube na web enquanto analisa seu uso e, depois, reforçou que as músicas existentes do Ministério de Louvor Metodista devem ser preservadas.

- Nenhuma música, faixa, conta ou arquivo real foi alterado durante esta implementação.
- A migração não muda `songs.audio_path`, revisões, faixas nem arquivos existentes. Cria estruturas, funções, índices e políticas de acesso. O áudio já está num bucket privado; a migração também reforça essa configuração.
- A consolidação ignora músicas criadas antes da ativação, em todas as equipes. Esse limite é persistido em `private.audio_asset_activation` e não muda ao reaplicar a migração. A RPC de confirmação repete a verificação, inclusive para chamadas administrativas. Não há opção de migrar o catálogo antigo no utilitário.
- Não executar scripts de reset da demonstração nem rotinas de limpeza de músicas reais para este trabalho.

## Implementação

`search_song_catalog` já filtrava pela equipe informada e validava `member_can`. A busca da própria equipe permanece; não há busca global adicionada. A nova política restritiva impede que uma política permissiva de compartilhamento exponha músicas de outra equipe. Gatilhos impedem associar músicas de outra equipe a cultos/repertórios ou trocar o proprietário de uma música pelo cliente.

Os links públicos de repertório passam a oferecer a lista, informações e referências externas, sem assinar os MP3 privados. A tela informa que os áudios ficam restritos aos integrantes. Também são filtradas associações antigas com outra equipe nos links de repertórios e cultos. **Esta é uma mudança intencional do compartilhamento público:** membros continuam ouvindo dentro do aplicativo autenticado; links anônimos deixam de entregar o áudio armazenado. Letras/cifras/referências públicas não são alteradas por esta etapa.

O cadastro/edição/importação continuam restritos à web pelas regras já existentes. A importação do YouTube permanece. Cada nova importação principal ganha endereço próprio; reimportar não sobrescreve os bytes da gravação anterior.

### Deduplicação de músicas novas

- Utilitário: `scripts/audio-assets/consolidate.py`; operação administrativa, sem exposição de hashes ou RPC de associação ao usuário.
- O servidor baixa e calcula SHA-256 dos bytes completos. Título/artista/URL não são usados como prova de igualdade.
- O destino privado é `_audio/<sha256>`. Upload sem sobrescrita; arquivo existente é baixado e verificado antes de ser vinculado.
- Cada equipe mantém sua música e autorização. Conhecer o hash não concede leitura ou associação. A política do Storage verifica a referência da própria equipe, consentimento/permissão e moderação.
- Song e faixas de `song_tracks` podem compartilhar bytes. Áudios complementares (`song_audio_attachments`) não são consolidados por esta versão.
- A confirmação transacional verifica revisão, caminho, versão do objeto e ausência de separação pendente. Se algo mudou, preserva os arquivos e ignora o resultado desatualizado.
- Só a mudança de endereço por consolidação preserva as faixas/revisão. Substituir a gravação continua invalidando as faixas como antes.
- A finalização do Demucs reconhece faixas geradas mesmo depois de consolidadas; reprocessar substitui essas faixas e mantém as manuais.
- Clientes não conseguem sobrescrever nem remover arquivos `_audio/`. Remover uma faixa retira a referência da própria equipe.

O comando é uma simulação por padrão. Lê `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` do ambiente privado; nunca passar chaves na linha de comando nem gravá-las no repositório:

```sh
python3 scripts/audio-assets/consolidate.py --limit 25
python3 scripts/audio-assets/consolidate.py --limit 25 --apply
```

Não há cron/agendamento ativado. Após implantação e QA, um operador pode executar lotes limitados ou configurar a periodicidade.

### Retenção e limpeza

A consolidação preserva o objeto original. A limpeza é separada e opcional (`--cleanup`, somente simula sem `--apply`). Revalida versão, referências em músicas/faixas/anexos/cache/jobs e exige pelo menos 24 horas. Caminhos aposentados não podem receber novos vínculos/envios por clientes. Somente caminhos originais aposentados de músicas novas são elegíveis; o catálogo anterior à ativação não entra nesse fluxo.

Não habilitar a limpeza no primeiro rollout. Conferir clientes antigos e URLs já emitidas antes. URLs assinadas existentes podem continuar válidas até sua expiração; retirar o acesso não apaga downloads anteriores. Uma tela muito antiga com endereço em cache pode precisar atualizar seus dados após a limpeza.

Esta rotina **não apaga objetos canônicos `_audio/` sem referências**. O coletor desses objetos e a reconciliação de uploads órfãos ficam separados para não remover bytes ainda usados por outra equipe. Isso implica retenção de alguns objetos sem uso e precisa ser tratado na operação, especialmente em exclusões de conta. Os caches legados `_ytcache`/`_stemcache` também não são coletados aqui.

## Demonstração para revisão

O seed passa a montar um repertório curto com:

1. Manhã de Graça — guia original da Equipe Demonstração.
2. Rio de Paz — guia original da Equipe Demonstração.
3. Baby Bird (demo) — Admiral Bob, trecho e faixas CC BY 3.0, com atribuição já presente no projeto.

As demais músicas fictícias continuam nos cultos. Não há comportamento especial no binário para revisores; a demo usa as mesmas regras de autorização.

Para a conta de revisão já existente, foi preparado `scripts/review-demo/curate-apple-repertoire.sql`: transação idempotente que valida e-mail de revisão, marca administrativa `review_demo`, propriedade e nome da equipe. Altera somente entradas do repertório de demonstração. Não recria contas, músicas, arquivos ou o vínculo do Asafe. **Executado no servidor em 09/10/2026, preservando músicas, faixas, arquivos e Asafe; ver registro de publicação.**

## Validação local anterior à implantação

- `npm run typecheck`: aprovado.
- `npm test -- --run`: 565 testes / 66 arquivos aprovados.
- `npm run build:store`: aprovado; aviso de tamanho dos bundles permanece.
- `node supabase/tests/audio/privacy.test.mjs`: 50 verificações reais de SQL/RLS em PGlite. Incluem isolamento, catálogo legado preservado, deduplicação, moderação, revogação, proibição de exclusão compartilhada, separação, limpeza e reaplicação.
- `node supabase/tests/lojas_all_migrations.mjs`: 171 verificações mais hardening, migrações juntas e reaplicadas; inclui exclusão de conta, consentimento e Asafe.
- `node supabase/tests/stems/fencing.test.mjs`: 56 verificações de fila/revisões.
- `node --test scripts/review-demo/seed.test.mjs`: 23 testes.
- `node supabase/tests/review_demo_seed.mjs`: 97 verificações, incluindo preservação integral de músicas/faixas/Asafe ao organizar a demo, mesmo com equipe real de mesmo nome.
- Python: 10 testes da consolidação, 9 de cada worker e 7 de importação/áudio complementar.
- Deno: 8 testes dos links públicos e handlers de separação; typecheck dos três Edge handlers alterados aprovado.
- FFmpeg decodificou o áudio M4A da demonstração usando a extensão de fallback do worker. Não foi executada uma nova separação real de IA nesta etapa.

Esses testes usam dados fictícios e integrações simuladas quando indicado. Não equivalem a QA de iPhone físico, serviço Storage real, concorrência PostgreSQL com conexões independentes ou execução Demucs após implantação.

## Plano original de publicação

Os itens executados e a validação em produção estão no [registro da publicação](publicacao-biblioteca-privada-20261009.md); esta lista preserva a sequência planejada.

1. Backup e preflight do servidor; revisar o diff. Implantar em transação **somente** a nova migração `20261010020000_private_audio_assets.sql`, sem reexecutar a migração antiga de drenagem dos workers. Atualizar ambos os workers e os handlers `public-playlist`, `public-culto`, `import-youtube`; a consolidação deve permanecer desligada durante o rollout. Publicar o frontend correspondente. Preservar configurações privadas dos workers.
2. Aplicar a curadoria somente na equipe fictícia; testar reprodução, ensaio, mixer, nova separação e acesso isolado entre duas equipes fictícias. Testar também leitura/reprodução de uma música antiga com autorização, sem reimportar, separar, renomear ou excluir músicas da Metodista. Verificar versão/hash dos arquivos existentes antes/depois. Só então experimentar a consolidação num lote pequeno de músicas novas fictícias, sem limpeza.
3. Gerar e enviar nova build ao TestFlight e conferir iPhone físico. Último registro disponível: 1.0.0 (11), selecionada na ficha, ainda não submetida à revisão. Não houve nova consulta ao App Store Connect nesta etapa.
4. **RevenueCat é a principal pendência funcional conhecida:** resolver/validar carregamento dos planos no iPhone brasileiro, compra de teste, liberação do plano no backend e restauração. Erro anterior registrado: `ML-IOS-OFFERINGS-23-BRA`; não atribuir a causa ao país do iPhone sem evidência. Não foi feito novo teste de compra nesta etapa.
5. Validar conversa do Asafe com a conta/grupo fictício e revisar credenciais/notas da revisão. Conferir se a ficha/capturas ainda correspondem à build final; anexar os produtos de assinatura que forem exigidos no envio inicial.
6. Enviar à revisão após concluir QA. O isolamento e a deduplicação tratam acesso/armazenamento; não documentam por si só autorizações de conteúdo. A análise do recurso de importação web ficou com o usuário; não declarar à Apple funcionalidades ou direitos que não correspondam ao serviço real.

Rollback: parar a consolidação primeiro. Enquanto não houver referência `_audio/`, o rollback é mais simples. Depois da consolidação, não restaurar políticas antigas ou a antiga RPC de separação: elas não entendem esses caminhos. Manter leitura/remoção protegidas e corrigir para frente, ou preparar migração inversa verificada por referência. Nunca apagar o acervo compartilhado para reverter interface.
