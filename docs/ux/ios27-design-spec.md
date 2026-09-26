# +Louvor — especificação do redesign iOS 27

Fonte de verdade visual: `docs/ux/maislouvor-ios27-claude.html` do checkout principal (protótipo aprovado pelo usuário em 26/09/2026), HIG em developer.apple.com/design e o kit Figma "iOS and iPadOS 27". Esta especificação traduz o protótipo para o código React + Tailwind + shadcn/ui.

## 1. Camadas (HIG > Materials)

| Camada | O que entra | Material |
|---|---|---|
| Conteúdo | páginas, cards, listas, formulários, gráficos | fundos agrupados do sistema, **opacos**. Nada de blur, borda luminosa ou translucidez em card. |
| Funcional | barra de abas, botões da barra superior, barra lateral (desktop), menus, popovers, toasts | **Liquid Glass** (`.liquid-glass`, `.liquid-glass-thick`) |
| Modal | folhas (dialog/drawer), alertas | folha com material espesso + scrim |

Regras:
- `GlassCard`, `.glass` e `.glass-subtle` passam a ser **cards de conteúdo opacos** (`bg-card`, `rounded-card`, sem borda). Não criar novo vidro na camada de conteúdo.
- Vidro só em controles flutuantes. Nunca vidro sobre vidro, exceto a lente da barra de abas.

## 2. Cores (HIG > Color, valores iOS 26/27)

Tokens (Tailwind) — use sempre os tokens, nunca `bg-white`, `text-gray-*`, `bg-black`, hex ou `yellow/green/red-500`:

| Token Tailwind | Claro | Escuro | Uso |
|---|---|---|---|
| `bg-background` | #F2F2F7 (systemGroupedBackground) | #000000 | fundo das telas |
| `bg-card` | #FFFFFF | #1C1C1E | cards e células |
| `bg-grouped-tertiary` | #F2F2F7 | #2C2C2E | célula dentro de card/folha, campo |
| `text-foreground` | #000000 | #FFFFFF | label |
| `text-muted-foreground` | #8A8A8E (secondaryLabel opaco) | #8D8D93 | texto secundário |
| `text-label-tertiary` | #C4C4C6 | #48484A | placeholder, terciário |
| `border-border` / `bg-separator` | #E0E0E3 | #38383A | separadores hairline |
| `bg-fill` / `bg-fill-secondary` / `bg-fill-tertiary` | rgba(120,120,128,.20/.16/.12) | rgba(120,120,128,.36/.32/.24) | chips, segmentos, botões cinza |
| `primary` | #1C1B17 (grafite quente da marca) | #F2F2F7 | cor de destaque (texto/ícone tintado) |
| `bg-prominent` / `text-prominent-foreground` | #1C1B17 / branco | #636366 / branco | fundo de botão proeminente (HIG: evitar branco com texto preto) |
| `ios-red` | rgb(255,56,60) | rgb(255,66,69) | destrutivo, indisponível, erro |
| `ios-green` | rgb(52,199,89) | rgb(48,209,88) | aceito, sucesso, "tudo certo" |
| `ios-orange` | rgb(255,141,40) | rgb(255,146,48) | pendente, atenção |
| `ios-yellow` | rgb(255,204,0) | rgb(255,214,10) | destaque raro |
| `ios-blue` | rgb(0,136,255) | rgb(0,145,255) | links do sistema, informação |
| `ios-gray` | rgb(142,142,147) | rgb(142,142,147) | ícones neutros |

Cor com parcimônia: verde/vermelho/laranja **só para status**. Ações principais usam `prominent`. Nunca cor só como indicador: sempre com texto ou símbolo.

Modo escuro: segue o sistema (`prefers-color-scheme`), classe `.dark` no `<html>`. Toda tela precisa funcionar nos dois.

## 3. Tipografia (HIG > Typography, Dynamic Type "Large")

Fonte: a do sistema (`font-sans` = -apple-system/SF Pro no iOS e macOS, Roboto no Android). Não importar Inter nem Google Fonts.

| Classe | Tamanho/entrelinha | Peso | Uso |
|---|---|---|---|
| `text-large-title` | 34/41, +0.40 | bold | título grande da página (só via `PageHeader`) |
| `text-title1` | 28/34, +0.38 | bold | números de destaque |
| `text-title2` | 22/28, −0.26 | bold | título de folha grande, data |
| `text-title3` | 20/25, −0.45 | semibold | cabeçalho de seção |
| `text-headline` | 17/22, −0.43 | semibold | título de linha/célula, título de folha |
| `text-body` | 17/22, −0.43 | regular | texto principal, campos |
| `text-callout` | 16/21, −0.31 | regular | |
| `text-subhead` | 15/20, −0.23 | regular | texto de linha em listas densas, botões de link |
| `text-footnote` | 13/18, −0.08 | regular | secundário, rodapé de seção, metadados |
| `text-caption1` | 12/16, 0 | regular | legendas |
| `text-caption2` | 11/13, +0.06 | regular | rótulos mínimos (abas, dias) |

Nada abaixo de 11px. Capitalização em caixa de frase ("Minhas escalas", não "Minhas Escalas").

## 4. Forma e espaçamento

- Margem lateral das telas: 16px (20px ≥ 430px). Seções separadas por 24–28px. Cabeçalho de seção: `text-title3` a 4px da margem do card.
- `rounded-card` = 24px (cards e grupos). Células dentro de grupo não têm raio próprio; separador hairline recuado até o texto.
- Botões: cápsula (`rounded-full`), altura ≥ 44px (compacto 36px só em barras densas, com área de toque 44).
- Alvos de toque ≥ 44×44 sempre.
- Ícones: lucide-react, `strokeWidth` 2 (2.25 em ≤16px), tamanho acompanhando o texto: 17–20px ao lado de body, 15px ao lado de footnote, 24px nas abas.

## 5. Padrões de componente

- **Lista agrupada (inset grouped)**: `rounded-card bg-card` com linhas `min-h-[52px] px-4 py-2.5`, ícone em quadrado 30px `rounded-[8px] bg-fill-tertiary` (ou colorido por status), título `text-body`/`text-subhead`, detalhe `text-footnote text-muted-foreground`, acessório à direita (chevron `text-label-tertiary` 14px, valor, switch). Separador entre linhas `border-t border-border` recuado 58px (ou 16px sem ícone).
- **Cabeçalho de seção**: `text-title3` à esquerda + ação `text-subhead font-medium text-primary` "Ver mais ›" à direita (alvo 44px).
- **Estado vazio**: símbolo 28px `text-label-tertiary`, título `text-body text-muted-foreground`, e, se houver, uma ação.
- **Segmented control** (Tabs): trilho `bg-fill-tertiary rounded-full p-0.5`, segmento ativo `bg-card shadow-sm rounded-full`, `text-subhead font-medium`.
- **Busca**: campo `h-10 rounded-full bg-fill-tertiary` com lupa, sem borda.
- **Botões**: `default` = proeminente (`bg-prominent`), `secondary` = cinza (`bg-fill-secondary text-foreground`), `outline` = cinza com texto tintado, `ghost` = só texto tintado, `destructive` = `text-ios-red`/`bg-ios-red`, `link`.
- **Status em badge**: cápsula `text-caption1 font-semibold` com fundo da cor a 15% e texto na cor (pendente = laranja, aceito = verde, recusado = vermelho).
- **Folhas (Dialog/Drawer)**: no celular, ancoradas embaixo, raio 32–38px, puxador, arrastar para baixo fecha. Barra da folha: **Fechar** (círculo de vidro com ✕) à esquerda, título `text-headline` centralizado, **Confirmar** (círculo proeminente com ✓ ou cápsula "Salvar") à direita. Use `DialogToolbar` quando o diálogo for formulário. Ações destrutivas em linha vermelha separada no fim, ou confirmação via `AlertDialog`.
- **Menus** (DropdownMenu/Popover): Liquid Glass espesso, raio 22px, linhas de 44px, texto à esquerda e ícone à direita (padrão iOS), separador de grupo com 8px.
- **Alertas** (AlertDialog): centralizado, 300px, raio 34px, título `text-headline` centralizado, mensagem `text-footnote`, botões cápsula empilhados/lado a lado; destrutivo em vermelho.
- **Toast**: banner de vidro no topo (estilo notificação), curto, nunca bloqueando conteúdo. Prefira feedback no próprio conteúdo quando possível.

## 6. Shell

- `AppLayout`: conteúdo em `main` rolável, fundo `bg-background`, sem orbes decorativos.
- **Celular (< lg)**: barra superior flutuante (botões de vidro 44px: menu/voltar à esquerda, ações da página à direita; título inline à esquerda aparece quando o título grande passa por baixo) + efeito de borda de rolagem progressivo + **barra de abas flutuante em cápsula** (Cultos · Repertório · Início · Chat · Usuário) com lente deslizante e arrastável, rótulos, aba selecionada tintada sobre plataforma. Sem círculo central elevado.
- **Desktop (≥ lg)**: barra lateral de vidro flutuante (estilo iPadOS), mesma navegação; conteúdo com título grande; sem barra de abas.
- `PageHeader` (novo, em `src/components/PageHeader.tsx`): `<PageHeader title subtitle? actions? back? />` renderiza o título grande no conteúdo e registra título/ações/voltar na barra superior do shell. Todas as páginas dentro de `/app` devem usá-lo em vez de `<h1>` próprio.
- Safe areas: `env(safe-area-inset-*)` em topo e base (PWA fullscreen e Capacitor Android).

## 7. Movimento e acessibilidade

- Transições curtas (200–420ms, curvas tipo mola), nada em loop. Respeitar `prefers-reduced-motion`.
- `prefers-reduced-transparency` e `prefers-contrast: more`: vidro vira superfície opaca.
- Foco visível só para teclado (`:focus-visible`), anel 3px `ios-blue`.
- Abas com `role="tablist"/"tab"` + `aria-selected`; diálogos com título; ícones decorativos `aria-hidden`.

## 8. O que não mudar

Lógica de dados, consultas Supabase, permissões (`isAdmin`, `canEdit`, `ResourceGuard`, `lib/permissions.ts`), rotas, textos de negócio (salvo capitalização), comportamento de áudio/ensaio/apresentação, testes existentes (devem continuar passando). Não aumentar os 14 erros de tipo pré-existentes.

## 9. Contratos de componentes (já existem ou serão criados nesta rodada)

Já prontos (shell, não editar sem necessidade):
- `src/components/shell/PageHeader.tsx` — `<PageHeader title subtitle? actions? back? >{children?}</PageHeader>`. Coloque como primeiro elemento da página. `actions` = `ToolbarButton`s (no celular vão para a barra superior; no desktop ficam ao lado do título). `back` em telas de detalhe (`"/app/cultos"` ou `true` para histórico). `children` = busca/segmentos logo abaixo do título.
- `src/components/shell/ToolbarButton.tsx` — `<ToolbarButton icon={<Plus />} aria-label="Nova música" onClick />` (círculo de vidro 44pt) ou com `label="Salvar"` (cápsula). `prominent` para a ação principal (uma só por barra, à direita).
- `src/contexts/ShellContext.tsx` — `useHideTabBar(hide?)` (esconde a barra de abas, ex.: dentro de conversa), `useHideShellTopBar(hide?)` (tela com cabeçalho próprio), `useMediaQuery`, `DESKTOP_QUERY`.
- `NotificationBell variant="toolbar"` e `TeamSwitcher variant="toolbar"` — itens de barra para a Home.
- O conteúdo das páginas já recebe do shell margem lateral (16/20px), topo (barra superior + safe area) e base (barra de abas + safe area). **Não adicione `pb-24`/`pt-16` próprios** nem cabeçalhos fixos que dupliquem a barra.
- Elementos fixos no rodapé de uma tela (compositor do chat, barra de ações em massa) devem ficar acima da barra de abas: `bottom-[calc(max(env(safe-area-inset-bottom),8px)+78px)]` no celular, ou esconda a barra de abas com `useHideTabBar()` e use `bottom-[max(env(safe-area-inset-bottom),8px)]`.

Criados pelo agente de overlays (use a API mesmo antes de ficarem prontos):
- `DialogContent` vira **folha iOS** no celular (ancorada embaixo, raio 38, puxador, arrastar para baixo fecha) e diálogo centralizado no desktop. O botão ✕ padrão fica à esquerda, em círculo de vidro; some sozinho quando a folha tem `DialogToolbar`.
- `DialogToolbar` (exportado de `@/components/ui/dialog`):
  `<DialogToolbar title="Novo culto" confirm={{ label: "Salvar", onClick: handleSave, disabled: saving, loading: saving }} />`
  `confirm` aceita `{ label, onClick?, type?: "button" | "submit", form?: string, disabled?, loading?, icon?: "check" | "none" }` — padrão `icon: "check"` (círculo proeminente ✓ com `aria-label=label`); `icon: "none"` mostra o texto em cápsula. Fechar (✕) à esquerda chama `DialogClose`; passe `onClose` se precisar de lógica extra. Use em diálogos de formulário no lugar de `DialogHeader` + `DialogFooter` com Cancelar/Salvar.
- `DialogHeader`/`DialogTitle` centralizados (`text-headline`), `DialogDescription` `text-footnote text-muted-foreground`. `DialogFooter` no celular empilha botões cápsula de largura total.
- `AlertDialog` = alerta iOS centralizado. Use para confirmar ações destrutivas.
- `DropdownMenu`/`ContextMenu`/`Popover`/`Select` = vidro espesso; em itens, o ícone vem primeiro no JSX e o componente o coloca à direita (padrão iOS).
- `Tabs` = controle segmentado. `Switch` = interruptor iOS verde. `Button` variantes conforme seção 5.
