/* ------------------------------------------------------------------
   Build das lojas (App Store e Google Play).

   O bundle enviado às lojas é compilado com VITE_STORE_BUILD=1. Nele, o
   app não importa áudio do YouTube (o servidor baixaria o vídeo: Apple
   5.2.3 e a política de propriedade intelectual do Play recusam). O
   link da gravação e o player oficial do YouTube continuam; o áudio
   entra pelo arquivo da própria pessoa.

   O site (maislouvor.com) e o APK de /baixar são compilados sem a
   variável e continuam com a importação. Decidido na compilação, nunca
   por chave remota: esconder uma função só do revisor viola a Apple 2.3.1.
   ------------------------------------------------------------------ */

/** Este bundle é o das lojas (VITE_STORE_BUILD=1 na compilação)? */
export function isStoreBuild(): boolean {
  return import.meta.env.VITE_STORE_BUILD === "1";
}

/**
 * Importar áudio de um link do YouTube (editor da música e áudios adicionais).
 * Função, e não constante, para os testes trocarem a variável sem recarregar o módulo.
 */
export function youtubeImportEnabled(): boolean {
  return !isStoreBuild();
}
