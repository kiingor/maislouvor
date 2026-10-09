// Regenera o ícone iOS a partir da marca vetorial, sem alterar os assets Android.
// Uso: node scripts/gen-ios-icon.mjs
import sharp from "sharp";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../public/favicon.svg", import.meta.url), "utf8");
const mark = source.match(/<path[^>]*\/>/);
if (!mark || !mark[0].includes('class="fg"')) {
  throw new Error("Marca vetorial esperada não encontrada em public/favicon.svg");
}

// O iOS aplica a máscara: a imagem de origem deve preencher todo o quadrado.
// A cor é fixa; o media query do favicon não deve inverter a marca na compilação.
const path = mark[0].replace('class="fg"', 'fill="#f5f5f5"');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 512 512"><rect width="512" height="512" fill="#121212"/>${path}</svg>`;
const output = new URL("../ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png", import.meta.url);

await sharp(Buffer.from(svg))
  .toColourspace("srgb")
  .removeAlpha()
  .png()
  .toFile(output.pathname);
console.log("Ícone iOS: marca original, 1024×1024, RGB opaco e fundo completo.");
