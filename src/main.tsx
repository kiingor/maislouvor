import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./index.css";
import { initAppearance } from "./lib/appearance";

// Erros que acontecem FORA do render (handlers, timers, promises) não passam pelo
// ErrorBoundary. Sem estes dois listeners eles somem silenciosamente.
window.addEventListener("error", (e) => {
  console.error("[window.error]", e.message, e.filename, e.lineno, e.error);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[unhandledrejection]", e.reason);
});

// Aparência (HIG > Dark Mode): Automático segue o sistema; Claro/Escuro ficam fixos (lib/appearance).
try {
  initAppearance();
} catch (e) {
  console.error("[appearance]", e);
}

// Anel de foco só para teclado: foco programático depois de toque não desenha anel.
document.addEventListener("pointerdown", () => document.documentElement.classList.add("pointer-mode"), true);
document.addEventListener(
  "keydown",
  (e) => {
    if (e.key === "Tab" || e.key.startsWith("Arrow")) document.documentElement.classList.remove("pointer-mode");
  },
  true,
);

const root = document.getElementById("root");

if (root) {
  createRoot(root).render(
    <ErrorBoundary scope="app">
      <App />
    </ErrorBoundary>
  );
} else {
  // Não deveria acontecer (a div está no index.html), mas se acontecer o usuário
  // via uma página branca absoluta. Melhor dizer alguma coisa.
  document.body.innerHTML =
    '<div style="min-height:100dvh;display:flex;align-items:center;justify-content:center;' +
    'background:#0B0B0C;color:#F2F2F3;font-family:system-ui,sans-serif;padding:24px;text-align:center">' +
    "Não foi possível iniciar o +Louvor. Recarregue a página.</div>";
}
