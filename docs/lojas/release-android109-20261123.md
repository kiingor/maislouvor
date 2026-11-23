# Android 1.0.9 (10) — correções do teste fechado

## Estado

**Versão 1.0.9 (10) enviada para análise no teste fechado Alpha em 23/11/2026
às 13:37 (America/Fortaleza), `2026-11-23T16:37:03Z`.** Upload aceito e processado,
release 3 salva e uma mudança enviada na Visão geral da publicação. Estado remoto
observado: **"Alterações em análise"**, com verificações rápidas estimadas em até
13 minutos. A versão 10 ainda não está disponível aos testadores.

Antes deste envio, a 1.0.8 (9) estava **disponível para os testadores** no Alpha
desde 21/11 às 23:37, sem nada em análise.

## Fonte e escopo

- Fonte: `d7bc7e5` na branch `fix/qa-primetestlab-10957`, criada de `a1be962`
  (`codex/android-roteiro-play`, mesma base da 1.0.8 `df8a909` + documentação).
- Correções do relatório PrimeTestLab nº 10957 (teste da 1.0.7 em Pixel 7 Pro, Android 17):
  - M-01 (`f1f0aab`): erros de login e senha em português (`src/lib/authErrors.ts`).
  - M-02 e S-01 (`3ee3cb4`): campo de data `DateField` sempre em dd/mm/aaaa; aviso ao
    criar culto com data passada.
  - M-03 (`dbdc185`): ícones da barra de status seguem a Aparência do app via
    `SystemBars.setStyle` (Capacitor 8). Com WebView < 140 seguem o aparelho, porque
    nesse caso a faixa da barra mostra o fundo nativo da janela.
- Não altera backend, catálogo de assinaturas, testadores, países ou permissões.

## Google Play

- App `4972080730623843909` (`com.maislouvor.app`), conta `6722061799796684003`.
- Teste fechado Alpha, faixa `4698888679988149607`, release `3`,
  nome "1.0.9 (10) — correções do teste fechado", lançamento completo.
- A 1.0.8 (9) não foi incluída na nova release (substituída pela 10).
- Avisos não bloqueantes, os mesmos da 1.0.8: sem arquivo de desofuscação e sem
  símbolos de depuração nativos. Nenhum dispositivo perdido (12.503 telefones,
  6.900 tablets).
- Publicação gerenciada desativada; a Visão geral tinha só esta mudança.
- Notas pt-BR em `release-notes-pt-BR.txt` na pasta da entrega.

## Pacote e validação

Pasta local `~/HomeLab/MaisLouvor/builds/Play-1.0.9-10-20261123/`, no mesmo processo
da 1.0.8 (`validation/prepare.sh` e `validation/sign-release.py`):

- Snapshot do commit sem `.env`; `google-services.json` copiado da 1.0.8 (hash conferido).
- Build de loja com a configuração pública da versão anterior, em memória, sem gravar valores.
- `cap sync android`, Gradle `bundleRelease` e `assembleRelease`.
- Assinado com a mesma chave de upload da 1.0.8 (certificado SHA-256
  `27b8c968d0384223a08b2476cf466e7ee4939aae27f507a54ce8dc7288f92164`); assinatura e
  alinhamento de 16 KiB verificados.
- `aapt2`: versão 10 / 1.0.9, API mínima 24, target 36, release não depurável,
  permissões iguais às da 1.0.8, cinco recursos Firebase presentes, sem arquivos de
  ambiente ou chaves no AAB. As três correções estão no bundle JS.
- Testes: 597 de 597 no worktree com `.env`. No snapshot sem `.env`, 7 arquivos de teste
  falham ao importar o cliente Supabase (URL indefinida); é ambiente, não regressão.
- Emulador Pixel 7 Pro / Android 16 (WebView 133), instalação limpa do APK assinado:
  login abre, senha errada mostra "Email ou senha incorretos.", reabertura a frio ok,
  logcat sem FATAL, ANR ou erro de JavaScript. Evidências em `validation/qa/`.
- Não testado: atualização pela Play Store a partir da 1.0.8, fluxos autenticados e
  compras. A barra de status com WebView 140+ (caso do testador) ficou coberta por
  teste automatizado; o emulador só tem WebView 133.

Artefato enviado: `artifacts/MaisLouvor-1.0.9-10.aab`, 27.677.496 bytes, SHA-256
`bb1595e67aca76121a72369359845a00bb92acc481296e5c0c58dbb929ff0803`.
Comprovantes: `upload-receipt.json`, `console-submission-20261123.txt` e `.png`.

## Próximos passos

- Aguardar a análise do Google; não reenviar nem reconstruir o pacote 10 enquanto estiver em análise.
- Responder ao relatório 10957 no painel da PrimeTestLab quando a 1.0.9 estiver disponível.
- Levar as correções para a `main` (esta branch e a `codex/android-roteiro-play` estão fora dela).
