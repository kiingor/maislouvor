// Gera o ícone de notificação do Android (status bar) — silhueta BRANCA da marca,
// em todas as densidades, em android/app/src/main/res/drawable-*/ic_stat_notify.png
import sharp from "sharp";
import { readFileSync, mkdirSync } from "fs";

const svg = readFileSync("public/favicon.svg", "utf8");
const m = svg.match(/<path[^>]*\/>/);
if (!m) throw new Error("path da marca não encontrado");
const pathEl = m[0].replace(/class="fg"/, 'fill="#ffffff"');

const densities = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };
for (const [d, size] of Object.entries(densities)) {
  const dir = `android/app/src/main/res/drawable-${d}`;
  mkdirSync(dir, { recursive: true });
  // marca ampliada (~80% da área), branca, fundo transparente
  const out = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><g transform="translate(256 256) scale(1.25) translate(-256 -256)">${pathEl}</g></svg>`;
  await sharp(Buffer.from(out)).png().toFile(`${dir}/ic_stat_notify.png`);
}
console.log("OK: ic_stat_notify.png gerado (mdpi..xxxhdpi)");
