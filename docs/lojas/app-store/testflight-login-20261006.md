# Login aprovado — TestFlight 1.0.0 (6)

## Escopo autorizado

O titular aprovou a prévia do novo login e autorizou publicar após remover o botão
play/pausa. O envio destina-se ao grupo interno **Teste iPhone** do +Louvor,
App Store Connect `6819834048`. Não inclui revisão pública, site, backend ou Android.

## Alterações

- Marca compacta, carrossel ilustrado e textos curtos em uma linha no tamanho normal.
- Equipe/repertório, ensaio com separação de voz/baixo/bateria e plano gratuito.
- Troca automática a cada 6,5 segundos, mesmo ao focar/digitar. Arraste horizontal
  no toque e no mouse, além dos indicadores e setas do teclado. Após um arraste,
  o temporizador reinicia e continua automaticamente. Não há botão play/pausa.
- Movimento reduzido e página em segundo plano suspendem a rotação; o gesto
  vertical não troca slides. O formulário mantém sua posição.
- Google, Apple nativo iOS e Face ID da compilação 5 preservados.
- O beta continua sem rodapé jurídico, como antes, pois os documentos públicos
  ainda não estão prontos. O código completo local conserva o rodapé; nenhum
  rascunho jurídico ou link público inexistente foi incluído no pacote interno.

## Preparação e validação

Gerador `scripts/ios-internal-testflight.mjs`, agora padrão build 6, incorpora
`src/pages/Login.tsx`, `src/components/auth/LoginShowcase.tsx` e `src/styles/login.css`
aos overlays explícitos da base interna `016eed98cedc5cfbd6bb5f5ecdbed6fe9b0eed28`.
Snapshots anteriores preservados. Fonte, archive e manifestos em
`tmp/ios-internal-testflight-6`. Cache DerivedData reutilizado; archive separado.

- Typecheck do snapshot e 91 testes em dez arquivos passaram.
- ESLint direcionado e diff sem erros.
- 39 verificações WebKit passaram: autoplay contínuo, ausência de play/pausa,
  swipe e retomada automática, arraste com mouse, teclado, movimento reduzido,
  temas, senha e matriz de cinco tamanhos. Alvo 440×956 sem rolagem e sem deslocar
  formulário, nos três slides claro/escuro; nenhum erro JavaScript.
- Archive Release e build Debug para simulador concluídos. Assinatura verificada
  com codesign; versão/build 1.0.0 (6), bundle, permissão Face ID e logs da ponte
  desabilitados conferidos. Manifesto com 15 hashes de arquivos nativos preservado.
- Instalado e iniciado no simulador iPhone 17 Pro Max / iOS 27. Captura nativa
  confirmou o login inteiro na tela, com descrição do ensaio em uma linha,
  Google/Apple e cadastro visíveis, sem play/pausa. Evidência:
  `tmp/ios-validation/build6-iphone17promax.png`.
- Fluxos reais de conta e biometria física continuam sujeitos ao teste no iPhone.

## Distribuição

Upload concluído em 06/10/2026 às 23:18 (America/Fortaleza), com
`Upload succeeded` e `EXPORT SUCCEEDED`. Processamento concluído; compilação
adicionada ao grupo **Teste iPhone**. App Store Connect confirmou **Em testes**,
com um tester e prazo exibido de 90 dias. Grupo com **1 tester e 4 compilações**
(1, 2, 5 e 6); builds 3/4 continuam sem grupo. Nenhum convite foi reenviado.

Instruções em português salvas no campo “O que testar”, incluindo os três slides,
arraste, rotação contínua e tela sem rolagem no 17 Pro Max. Captura da disponibilidade:
`tmp/ios-validation/build6-testflight-em-testes.png`.

O App Store Connect confirmou a instalação anterior da compilação 5 no iPhone
17 Pro Max. Para a nova versão: **TestFlight → +Louvor → Atualizar**, versão
**1.0.0 (6)**. Instalação da compilação 6 e teste físico ainda não confirmados.

Sem revisão pública, publicação de site/backend/Android ou commit/push. A automação
original de acompanhamento permanece PAUSED. Pendências jurídicas da release
completa permanecem registradas em `preparacao-20261006.md`.

Logs: `tmp/ios-validation/build6-prepare.log`, `build6-archive.log`,
`build6-simulator.log` e `build6-upload.log`.
