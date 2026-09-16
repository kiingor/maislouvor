// Gera as imagens-fonte (assets/) para o @capacitor/assets a partir da marca (public/favicon.svg).
// Uso: node scripts/gen-android-icons.mjs   (rodar na raiz do projeto)
import sharp from "sharp";
import { readFileSync, mkdirSync } from "fs";

const svg = readFileSync("public/favicon.svg", "utf8");
const m = svg.match(/<path[^>]*\/>/);
if (!m) throw new Error("path da marca não encontrado em favicon.svg");
// cor fixa (clara) na marca — ignora o media query dark do favicon
const pathEl = m[0].replace(/class="fg"/, 'fill="#f5f5f5"');

mkdirSync("assets", { recursive: true });

const BG = "#121212";
const W = 1024;

// Ícone completo (legacy/round): quadrado escuro arredondado + marca
const iconOnly = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 512 512"><rect width="512" height="512" rx="112" fill="${BG}"/>${pathEl}</svg>`;
// Foreground adaptativo: só a marca, transparente, reduzida p/ caber na safe-zone
const iconFg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${W}" viewBox="0 0 512 512"><g transform="translate(256 256) scale(0.78) translate(-256 -256)">${pathEl}</g></svg>`;

// Splash: fundo escuro + marca centralizada
const S = 2732;
const splash = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}"><rect width="${S}" height="${S}" fill="${BG}"/><g transform="translate(${S / 2} ${S / 2}) scale(2.2) translate(-256 -256)">${pathEl}</g></svg>`;

await sharp(Buffer.from(iconOnly)).png().toFile("assets/icon-only.png");
await sharp(Buffer.from(iconFg)).png().toFile("assets/icon-foreground.png");
await sharp({ create: { width: W, height: W, channels: 4, background: BG } }).png().toFile("assets/icon-background.png");
await sharp(Buffer.from(splash)).png().toFile("assets/splash.png");
await sharp(Buffer.from(splash)).png().toFile("assets/splash-dark.png");

console.log("OK: assets/icon-only.png, icon-foreground.png, icon-background.png, splash.png, splash-dark.png");
