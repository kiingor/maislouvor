# Biblioteca privada — publicação de 09/10/2026

## Escopo autorizado e preservação

Filipe autorizou publicar a etapa 1 e organizar músicas existentes na conta de demonstração ligada ao Asafe. O catálogo do Ministério de Louvor Metodista deve permanecer intacto. Não houve submissão à revisão pública da Apple.

Fontes: `a28816ce86a6fbdf5c64783466ed3e10511948c8` (biblioteca privada) e `7fbb07773f9212e94ae8b75a9b3907701be4e5a9` (somente número iOS 12). Branch `codex/integracao-lojas-revenuecat`.

## Servidor e web publicados

- Backup PostgreSQL em formato custom validado com `pg_restore --list`, 1.521.321 bytes, SHA-256 `c3333937f282e5d6d40f7a9a2ef44822f1d50718208520853edcb593a0a139dd`. Preservado no diretório privado `/var/lib/maislouvor-deploy/20261009-private-audio/database.before.dump`.
- Preflight verificou hashes dos handlers/workers. Claims pausados temporariamente, fila drenada e workers parados de forma controlada; depois retomados com as definições originais.
- Aplicada somente `20261010020000_private_audio_assets.sql`, primeiro em transação revertida e depois com commit e registro no histórico de migrações. Comparação transacional de todo o catálogo antes/depois abortaria em caso de alteração.
- **283 músicas, 605 faixas, 1.034 objetos de áudio e vínculos do Asafe permaneceram iguais**, incluindo hashes de todos os registros. A coluna nova `generated_stem` foi excluída da comparação de campos antigos.
- Atualizados `public-playlist`, `public-culto`, `import-youtube`, worker CPU e GPU local. Configuração privada/LaunchAgent preservados; 66 arquivos de outras Edge Functions conferidos sem mudança. Edge voltou saudável.
- A segunda GPU externa não foi alterada nesta execução; segue a pendência anterior de atualização do protocolo. CPU e GPU local mantêm o serviço.
- **Consolidação e limpeza continuam desligadas.** Nenhum arquivo real foi movido, deduplicado, sobrescrito ou excluído. Músicas anteriores à ativação permanecem inelegíveis para consolidação.
- Web `20261009-web-private-audio` publicada às **21:19:03, America/Fortaleza** (`2026-10-10T00:19:03Z`). Conferidos 224 arquivos, 141 assets via HTTPS e sete rotas. APKs, marketing e assets antigos preservados.

A mudança intencional nos links públicos permanece: lista e referências disponíveis; MP3 privados acessíveis dentro da equipe autenticada. Importação YouTube na web foi mantida conforme solicitado.

## Demonstração e Asafe

Aplicado `scripts/review-demo/curate-apple-repertoire.sql` com verificação de identidade da fixture e comparação antes/depois. Somente as entradas de **Repertório da Demonstração** mudaram:

1. Manhã de Graça.
2. Rio de Paz.
3. Baby Bird (demo), com cinco faixas existentes para o mixer.

As seis músicas do catálogo de demonstração e seus áudios continuam presentes. O grupo **Teste a safe** permanece vinculado a **Igreja Demonstração (App Review)**. Nenhuma música da Metodista foi copiada; foram reutilizados os materiais da demonstração já existentes e identificados no seed. Não houve mensagem de WhatsApp, convite, vínculo pessoal ou consentimento individual criado.

## QA depois da implantação

- Login real da conta marcada `review_demo`: seis áudios originais e cinco faixas baixados com sua sessão; repertório e vínculo do Asafe conferidos.
- Conta demo não consegue consultar música de outra equipe nem baixar seu arquivo. Endpoint anônimo de repertório público não retorna áudio assinado ou caminho privado.
- Arquivo antigo da Metodista baixado administrativamente, sem alteração. Verificação SQL em transações somente leitura, sob o papel `authenticated` e a identidade de um integrante atualmente autorizado, confirmou os **19 registros de músicas, 72 faixas e 11 áudios principais** esperados para a equipe. Não foi criado consentimento para integrantes que não estão autorizados.
- Separação real isolada: sinal sintético de oito segundos → handler → fila → GPU → **seis faixas em 11 segundos**. Downloads autenticados, revisão e job final conferidos. Sem notificações. Removidos apenas a fixture identificada e seus treze arquivos; limpeza confirmada. Não mede qualidade musical da separação.
- QA na web de produção em Chromium: login, três músicas visíveis, reprodução/pausa do áudio original, avanço no ensaio, cinco faixas do mixer, mute/solo e reprodução simultânea das faixas confirmados; zero falhas de `play()` e zero erros JavaScript. Capturas do repertório e mixer inspecionadas. O aviso individual do Asafe foi apenas fechado, sem registrar aceite/recusa. O teste de navegador não equivale ao iPhone físico.

## iOS 1.0.0 (12)

Fonte congelada em `/Volumes/MaisLouvorBuild/Release-1.0.0-12`; archive em `/Volumes/MaisLouvorBuild/Archives/MaisLouvor-1.0.0-12.xcarchive`. Xcode no NVMe, assinatura verificada, bundle `com.maislouvor.app`, ícone presente e 225 arquivos web idênticos por SHA-256 à fonte sincronizada. Configurações privadas não foram incluídas no Git.

Upload concluído às **21:22:04, America/Fortaleza**, com `EXPORT SUCCEEDED`. Depois do processamento, a compilação 12 foi vinculada ao grupo interno **Teste iPhone**, com um tester existente; notas desta versão salvas e lidas novamente. Às **21:26**, o App Store Connect já mostrava **Instalado 1.0.0 (12)** para o tester no iPhone 17 Pro Max. Isso confirma disponibilidade, sem afirmar validação funcional pelo usuário. Nenhum novo tester ou convite foi criado. Exportação sem limitação a testes internos; não houve submissão à App Review. A seleção anterior da ficha de distribuição (11) não foi alterada neste passo.

## Evidências privadas locais

`/Volumes/MaisLouvorBuild/Private-Audio-Release-20261009` contém fases da implantação, payload, backup dos fontes/configuração local, QA de acesso e separação. Não versionar dumps, credenciais ou payloads privados. Resultados da publicação web em `tmp/web-releases/20261009-web-private-audio` (ignorado pelo Git).

## Próximas etapas

1. Build 12 liberada no grupo Teste iPhone. Completar QA funcional no aparelho físico (ensaio, mixer e áudios existentes).
2. Resolver/validar RevenueCat: planos no iPhone brasileiro, compra Sandbox/TestFlight, liberação do plano e restauração. O erro anterior `ML-IOS-OFFERINGS-23-BRA` ainda não tem correção confirmada nesta entrega.
3. Validar conversa real do Asafe com vínculo/consentimento do próprio testador. Conferir ficha, materiais dos produtos de assinatura e notas antes de enviar à revisão.
4. A análise das fontes de importação web permanece com o responsável. Biblioteca privada/deduplicação não constituem comprovação de direitos; não marcar declarações de direitos sem fundamento.

Detalhes de implementação e rollback: [biblioteca-privada-20261009.md](biblioteca-privada-20261009.md). Não restaurar RPCs/políticas incompatíveis se houver futuras referências canônicas `_audio/`; nunca excluir acervo para reverter interface.
