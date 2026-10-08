# Gestão de músicas na web — 8 de outubro de 2026

## Escopo confirmado por Filipe

- Criar repertório e cadastrar/editar músicas ficam na web para líderes (`isAdmin`, papel `admin`), respeitando também a permissão do recurso.
- A web inclui o navegador do celular. A regra não depende da largura da tela.
- Nos apps iOS e Android, inclusive APK distribuído fora da loja, não aparecem os cadastros nem a importação de música por arquivo ou YouTube. A flag `VITE_STORE_BUILD=1` também aplica essa experiência às prévias do bundle.
- Asafe, separação local de faixas, mixer, ensaio, loops, escalas e consulta de músicas permanecem. A separação mantém a permissão anterior, independente da disponibilidade do cadastro.
- Adicionar músicas já cadastradas, gerar uma seleção dentro de repertório existente, ordenar, renomear e excluir mantêm suas permissões anteriores. Apenas criar um repertório novo sai do app.

## Implementação

- `src/lib/storeBuild.ts`: disponibilidade por plataforma Capacitor e build.
- `src/hooks/useMusicManagement.ts`: disponibilidade do cadastro para líderes na web.
- `Repertorios`, `RepertorioModal`, `SetlistGeneratorModal` e `AddSongModal`: botões, estados vazios, rascunhos, destinos de geração e ações de cadastro protegidos pela mesma regra.
- `SongEditor`: links diretos de músicas publicadas abrem para consulta no app; não retomam rascunhos. Salvamento e importação ficam indisponíveis. Separação e associação a repertórios existentes têm permissões independentes.
- `AudioUpload`, `TrackUpload`, `SongAudioAttachments` e serviço de áudios adicionais: sem envio de arquivos no app; gravações e faixas existentes continuam acessíveis.
- Nenhuma alteração de schema, RLS, serviço de separação ou Asafe. A distinção web/app é disponibilidade do cliente; as permissões do servidor continuam vigentes. Não equivale a uma nova restrição de acesso direto à API.

## Validação

- TypeScript aprovado.
- Suíte completa: **53 arquivos / 456 testes aprovados**.
- Casos cobrem líder/editor, web/app, flag de loja/APK, acesso direto, ausência de importação, criação na web, separação no app e manutenção de repertório existente.
- Chromium e WebKit, viewport **440 × 956**: seis cenários (app, web líder e web editor em cada motor), sem erros JavaScript nem overflow horizontal. Fixtures locais sem escrita no servidor real; não representam teste em iPhone físico.
- Bundle de loja compilado por `VITE_STORE_BUILD=1 npx vite build`, apenas para QA. O comando direto não substitui o gate jurídico do release.
- Evidências locais ignoradas pelo Git em `tmp/web-music-management/`, incluindo `results.json` e capturas.

## Publicação

Alteração local em `codex/integracao-lojas-revenuecat`, sem push, deploy ou novo envio ao TestFlight nesta etapa. O build instalado anteriormente não recebe a alteração até uma nova distribuição.

As pendências de release já registradas continuam: SMTP adiado, retenção efetiva dos backups e base/fluxo de dados sensíveis. Esta divisão de funcionalidades não é uma validação de direitos sobre conteúdo nem garantia de aprovação nas lojas.
