

## Plano: Correções na Apresentação e Loop Panel

### 4 mudanças a implementar:

---

### 1. Página inicial → Home (não Repertórios)

Em `src/pages/Login.tsx` linha 40, o redirect após login vai para `/app/repertorios`. Precisa mudar para `/app/home`.

---

### 2. Novo loop pega tempo atual da timeline + auto-formatação do tempo

No `LoopPanel.tsx`, quando o usuário clica "Novo Loop":
- Preencher `formStart` com `formatTime(currentTime)` automaticamente
- Preencher `formEnd` com `formatTime(currentTime)` também (para o usuário ajustar)

Para a **auto-formatação**: substituir os inputs de tempo por uma função que formata enquanto o usuário digita. Ao digitar apenas números (ex: "130"), auto-formatar para "1:30". A lógica:
- Remove tudo que não é dígito
- Se tem 3+ dígitos, insere `:` antes dos 2 últimos (ex: "130" → "1:30", "1015" → "10:15")
- Se tem 1-2 dígitos, mostra como "0:XX"

---

### 3. Inputs de início/fim cortando — layout fix

Na screenshot, os inputs estão cortados. O layout `flex gap-2` com dois `flex-1` mais os botões de marcar está apertado. Solução:
- Dar `min-w-0` nos containers flex
- Garantir que o input tenha largura mínima adequada
- No mobile, empilhar início/fim em coluna se necessário

---

### 4. Timeline maior no desktop

Na barra de transporte em `Presentation.tsx` (linha ~1347), a timeline do áudio tem `md:w-48 lg:w-64`. Aumentar para `md:w-64 lg:w-96 xl:flex-1` para que ocupe mais espaço no desktop. Também aumentar a altura da barra de `h-1.5` para `h-2 md:h-3` no desktop.

---

### Arquivos a modificar

| Arquivo | Mudança |
|---|---|
| `src/pages/Login.tsx` | Redirect após login: `/app/home` |
| `src/components/LoopPanel.tsx` | Auto-preencher tempo ao abrir form, auto-formatação de tempo nos inputs, fix layout cortado |
| `src/pages/Presentation.tsx` | Aumentar timeline no desktop |

