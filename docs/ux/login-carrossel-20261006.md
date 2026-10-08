# Prévia do login com carrossel — 6 de outubro de 2026

> Estado atual: visual aprovado pelo titular, play/pausa removido e compilação
> 1.0.0 (6) disponível no TestFlight, **Em testes** no grupo **Teste iPhone**. Abaixo está
> o histórico da prévia; ver [registro do envio](../lojas/app-store/testflight-login-20261006.md).

## Pedido e estado inicial

O titular achou o login do TestFlight longo no iPhone 17 Pro Max e pediu uma tela mais
caprichada, com animação e carrossel sobre o app/plano gratuito. Pediu explicitamente
para ver antes de publicar. A mudança está implementada apenas no checkout
`MaisLouvor-lojas`; nenhum novo archive, upload, deploy, commit ou push foi realizado.
O TestFlight continua na compilação 1.0.0 (5).

## Direção e implementação

Mantidos a marca grafite e os tokens claro/escuro do produto, com SF Rounded nos
pequenos títulos da apresentação, SF Text nos controles e monoespaçada nos acordes.
A assinatura visual são folhas de repertório sobrepostas, desenhadas em CSS e SVG,
com entrada suave de 420–500 ms. Não há fontes externas ou nova dependência.

Três mensagens: organização da equipe/repertório; cifras e transposição para o ensaio;
começar no plano gratuito. Sem inventar preços, limites, prazo de teste ou condições
comerciais ainda não definidas. Cada slide tem uma ilustração de exemplo, sem dados reais.

- JavaScript troca os slides a cada 6,5 segundos. Pausa ao focar os controles, digitar,
  navegar manualmente ou deixar a página em segundo plano. Há botão de pausa/reprodução,
  navegação por teclado e gesto horizontal. Movimento reduzido desativa animação e autoplay.
- Slides compartilham uma grade para reservar a maior altura intrínseca; o formulário
  não muda de posição. Google/Apple ficam lado a lado no 17 Pro Max e empilhados em
  larguras menores. Apple continua exclusivo do app nativo iOS.
- Cabeçalho compacto, texto curto, recuperação de senha junto ao título e controle
  de mostrar/ocultar senha. Formulário, provedores, cadastro e links legais preservados.
- Não foi aplicado bloqueio global de rolagem: teclado, telas muito menores e texto
  aumentado precisam manter os controles alcançáveis.

Arquivos: `src/pages/Login.tsx`, `src/components/auth/LoginShowcase.tsx`,
`src/styles/login.css`; o contêiner de `SocialLoginButtons.tsx` recebeu um atributo
visual e gap flex equivalente ao espaçamento anterior. Os helpers de autenticação
usados em cadastro/reset/convites foram preservados.

## Prévia e verificações

Com Vite local em 127.0.0.1:5186:

- `/tmp/login-preview/index.html`: apresentação interativa com moldura do aparelho,
  escolha dos slides e modo claro/escuro.
- `/tmp/login-preview/screen.html`: componente real de Login, isolado para a prévia.
  O ambiente de visualização mostra os botões iOS e intercepta ações de autenticação;
  não inicia logins nem altera dados. Os arquivos ficam ignorados em `tmp/` e não são
  ponto de entrada da distribuição.
- `/login`: tela real web do projeto, com o comportamento normal dos provedores.

37 verificações em WebKit passaram: autoplay, pausa ao digitar, teclado, swipe,
movimento reduzido, senha visível/oculta, tema, plataforma e matriz de cinco tamanhos
em três slides/duas aparências. Em **440 × 956**, simulando safe areas de 62/34 px,
`scrollHeight=956`, `scrollWidth=440`, em todos os slides claro/escuro. Nenhuma mudança
na posição do formulário durante o carrossel. Sem erro JavaScript ou overflow
horizontal. Em telas menores, rolagem vertical permanece possível por acessibilidade.

Typecheck e ESLint direcionado passaram. 26 testes existentes de login social,
callback, Face ID e aceite no cadastro passaram. Conferidos visualmente a apresentação,
o desktop e os temas; inspeção adicional em Chromium confirmou a renderização escura.
O novo visual ainda não foi executado no iPhone físico.

Evidências locais: `tmp/login-preview/qa-results.json`, `preview-board.png`,
`iphone-light-1.png` a `iphone-light-3.png`, equivalentes escuros e `desktop.png`.

## Preparação prevista antes da aprovação (histórico)

O gerador do beta interno ainda usa o Login da base congelada. Ao preparar a próxima
compilação, incorporar explicitamente `Login.tsx`, `LoginShowcase.tsx` e `login.css`
aos overlays e manter o tratamento dos links/documentos legais coerente com o pacote.
Não publicar os rascunhos jurídicos como documentos definitivos, nem sobrescrever os
snapshots existentes. O rodapé mostrado na prévia é o da versão completa local.

Referências: [Apple — especificações do iPhone 17 Pro Max](https://support.apple.com/en-us/125091)
e [W3C — padrão de carrossel acessível](https://www.w3.org/WAI/ARIA/apg/patterns/carousel/).

## Refinamento solicitado — faixas e frases em uma linha

O slide de ensaio agora ilustra faixas separadas de voz, baixo e bateria, mantendo
cifras, letras e transposição no cartão. As descrições ficaram:

- Escalas e repertórios em um só lugar.
- Separe as faixas. Ensaie no seu tom.
- Experimente com a sua equipe.

Não foi usado nowrap, corte ou reticências: a concisão resolve a quebra no tamanho
normal, preservando a adaptação quando o usuário aumenta a fonte. Verificação de
18 cenários em WebKit (três slides, claro/escuro, 320/390/440 px) confirmou títulos e
descrições em uma linha, sem overflow horizontal. O alvo 440×956 continua sem rolagem.
Typecheck e diff sem erros; capturas e painel da prévia atualizados. Evidência adicional:
`tmp/login-preview/qa-copy-results.json`. Ainda não publicado.

## Aprovação e preparação da compilação 6

O titular aprovou o visual e autorizou publicar no TestFlight, solicitando remover
play/pausa e manter troca automática com arraste. Botão e pausa por foco/hover
removidos. Rotação continua ao digitar e retoma após o gesto; movimento reduzido e
segundo plano continuam respeitados. Arraste por mouse também foi validado.

39 verificações WebKit passaram após o ajuste. O gerador do beta agora incorpora
os três arquivos do login, preservando a ausência de rodapé jurídico no pacote
interno. A prévia completa local conserva o rodapé. Estado do envio no
[registro da compilação 6](../lojas/app-store/testflight-login-20261006.md).
