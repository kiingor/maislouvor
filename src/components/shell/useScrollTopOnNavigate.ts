import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Cada tela do app começa do topo da área de rolagem do shell. Exceção: endereço
 * com #âncora (ex.: /app/settings#excluir-conta), em que a própria seção cuida de
 * aparecer. Como este efeito roda no layout, depois dos efeitos das telas filhas,
 * rolar para o topo aqui desfaria a rolagem delas.
 */
export function useScrollTopOnNavigate(scrollEl: HTMLElement | null | undefined) {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) return;
    scrollEl?.scrollTo({ top: 0 });
  }, [pathname, hash, scrollEl]);
}
