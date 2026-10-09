import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "favicon.png", "favicon.ico", "apple-touch-icon.png", "icon-192.png"],
      workbox: {
        // Não intercepta o download do APK (senão o SW devolve a SPA → 404 interno).
        directoryIndex: null,
        navigateFallbackDenylist: [/^\/(?:\?|$)/, /^\/conheca(?:\/|$)/, /^\/baixar(?:\/|\?|$)/, /^\/~oauth/, /\.apk$/],
        // essentia.js (key detection) is a large, lazy-loaded chunk — fetch on demand, don't precache
        globIgnores: ["**/essentia*"],
        // O bundle principal passou de 2 MiB (limite padrão do Workbox) — eleva p/ precachear.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Adiciona os handlers de Web Push (push / notificationclick) ao SW gerado.
        importScripts: ["/push-sw.js", "/landing-sw.js"],
        // Make new deploys take over right away instead of serving a stale shell.
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
      },
      manifest: {
        name: "+Louvor",
        short_name: "+Louvor",
        description: "Organize os repertórios da sua equipe de louvor",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "any",
        id: "/",
        start_url: "/app",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: "/favicon.png", sizes: "512x512", type: "image/png", purpose: "any maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
