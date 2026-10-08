import { Capacitor } from "@capacitor/core";

/** Este bundle é o das lojas (VITE_STORE_BUILD=1 na compilação)? */
export function isStoreBuild(): boolean {
  return import.meta.env.VITE_STORE_BUILD === "1";
}

/** Cadastro e importação de músicas ficam na web, inclusive no navegador móvel.
 * A regra vale para todos os apps nativos, também APKs fora das lojas.
 * A flag mantém a mesma experiência nas prévias do bundle das lojas.
 */
export function musicManagementEnabled(): boolean {
  return !isStoreBuild() && !Capacitor.isNativePlatform();
}

/**
 * Importar áudio de um link do YouTube (editor da música e áudios adicionais).
 * Função, e não constante, para os testes trocarem a variável sem recarregar o módulo.
 */
export function youtubeImportEnabled(): boolean {
  return musicManagementEnabled();
}
