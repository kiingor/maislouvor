# Home e Assinatura publicadas — 09/10/2026

Filipe autorizou a chamada discreta de planos na Home e a retirada de “Voltar”
da aba Assinatura. A atualização web foi publicada em **08/10/2026 às 21:36:27
de Brasília** (09/10/2026, 00:36:27 UTC), release `20261009-home-planos-v2`.

## Fonte e preservação do trabalho paralelo

- `5beff48ac659985ab721fb1c543d7d3cd6b47b13`: chamada “Mais vagas para sua
  equipe / Amplie quando precisar. / Ver planos”, somente para proprietário
  gratuito elegível; destino abre Assinatura na equipe correta, sem “Voltar”.
- A cópia compartilhada tinha duas alterações paralelas não commitadas para
  `/baixar`. Foi criado um worktree gerenciado para compilar exatamente a fonte
  aprovada, sem alterar esses arquivos compartilhados nem o `.env` preexistente.
- A primeira aplicação foi bloqueada **antes de qualquer upload ou escrita**:
  outro trabalho havia publicado a página de downloads, alterando marketing,
  Caddy, `landing-sw.js` e `sw.js`. Essa tentativa não foi reutilizada.
- Por coordenação explícita, somente os dois ajustes de `/baixar` foram copiados
  e revisados no worktree isolado: entrada reconhecida por `landing-sw.js` e
  exclusão do fallback SPA na configuração Workbox. Commit rastreável
  **`110867a7a850a2397175c73f999148cffc8f498b`**, branch
  `codex/home-planos-release`, é a fonte final publicada.
- O `landing-sw.js` preparado corresponde exatamente ao que já estava no ar:
  `6bec8c887b8c4533da361ef48b1f6a4fbdf9c0b7409e0f2b26fcadafc1178b7e`.
  O service worker gerado mantém `/baixar`, seus subcaminhos e parâmetros fora
  do fallback. Comparando os dois builds, somente `landing-sw.js` e `sw.js`
  mudaram; os assets da interface permaneceram idênticos aos já conferidos.

## Publicação e validação

O build normal `npm run build`, com a trava legal, passou. O pipeline
`scripts/lojas/publish-integrated-web.py` usou novo snapshot e manteve todas as
guardas de concorrência, backup e reversão. Não modificou Caddy, marketing,
APKs, backend, contratos ou credenciais de cobrança.

- 223 arquivos conferidos no servidor; 140 assets/shell por HTTPS; sete rotas
  principais aprovadas. Reversão automática não foi necessária.
- Os 59 arquivos protegidos de marketing/Caddy e os assets antigos foram
  preservados, incluindo a página de downloads publicada em paralelo.
- Novo `index.html`:
  `cf9fc744a683cb6a20278a478cc47e2ec88b4f74320c122f716b4de2b99bb2e7`.
- Chrome via CUA: login compacto no domínio publicado, asset
  `index-Cbc7mHh1.js`, três slides, sem play/pause e sem rolagem em 440 × 956.
  Nenhum erro no console nessa verificação.
- O navegador tinha o service worker anterior. Após a ativação, `/baixar`
  navegou automaticamente para a landing nova (“Seu próximo ensaio começa
  aqui.”); seu link de acesso abriu o login novo. Não houve limpeza de cache
  ou dados do usuário.

Os 17 testes direcionados da chamada/rota/aba foram aprovados no trabalho de
implementação. A QA sintética independente confirmou Home e Assinatura em
440 × 956 e 320 × 956, sem overflow e sem “Voltar”; evidências no commit
`4279992` e em `screenshots/home-assinatura-20261009/README.md`. Esses dados e
preços são fictícios, não representam compra ou catálogo do provedor. A inspeção
pública desta publicação não entrou em contas nem realizou pagamentos.

Capturas reais de login/download desta entrega:
`screenshots/home-planos-web-20261009/`. A aparência da Home autenticada é
documentada pelas fixtures citadas acima, não por acesso a uma conta real.

## Evidências e recuperação

- Resultado remoto:
  `/var/lib/maislouvor-deploy/20261009-home-planos-v2/result.json`.
- Pacote, hash, manifestos, resultado, logs e relatório da tentativa bloqueada
  preservados e conferidos fora do worktree, em
  `/Volumes/Extreme SSD/MaisLouvor/Releases/Web/20261009-home-planos-v2/`.
- SHA-256 do pacote:
  `bc2704f019373342ce0d6f8d435ee0ec10f437a5770cd2339d7ad0e010756386`.
- Reversão pelo comando `rollback --release 20261009-home-planos-v2`, somente
  enquanto essa release continuar ativa; a guarda recusa sobrescrever alterações
  posteriores. Não reverte banco nem configurações de outros projetos.

O binário iOS 1.0.0 (8) é tratado pelo coordenador, usando a mesma fonte final.
Publicação web não comprova processamento/disponibilidade desse beta nem compra
RevenueCat. Não houve merge em `main` nesta operação.
