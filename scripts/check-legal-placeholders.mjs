#!/usr/bin/env node
// Trava de release (lojas): os documentos jurídicos não podem ir ao ar com
// valores pendentes — o site pediria a todos o aceite de Termos e de uma Política
// sem o responsável identificado (LGPD, art. 9º, III). Procura o marcador em
// src/lib/legal.ts e src/content/legal/ e sai com erro enquanto restar algum.
// Roda sozinho antes de `npm run build` (prebuild) e de `npm run build:store`;
// não faz parte dos testes automatizados. Build de teste local: `npx vite build`.
//
//   node scripts/check-legal-placeholders.mjs
//
// Linhas com "check-legal-placeholders: ignore" são puladas (a própria definição
// do marcador).
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MARK = ['PREENCH', 'ER'].join('');
const IGNORE = 'check-legal-placeholders: ignore';
const targets = [join(root, 'src/lib/legal.ts'), join(root, 'src/content/legal')];

async function filesIn(path) {
  const entries = await readdir(path, { withFileTypes: true }).catch(() => null);
  if (!entries) return [path];
  const nested = await Promise.all(entries.map((entry) => filesIn(join(path, entry.name))));
  return nested.flat().filter((file) => /\.(ts|tsx|md)$/.test(file));
}

const files = (await Promise.all(targets.map(filesIn))).flat();
const pending = [];
for (const file of files) {
  const lines = (await readFile(file, 'utf8')).split('\n');
  lines.forEach((line, i) => {
    if (line.includes(MARK) && !line.includes(IGNORE)) {
      pending.push(`${relative(root, file)}:${i + 1}: ${line.trim()}`);
    }
  });
}

if (pending.length) {
  console.error(`Documentos jurídicos com ${pending.length} valor(es) pendente(s) (${MARK}):\n`);
  for (const item of pending) console.error(`  ${item}`);
  console.error('\nPreencha em src/lib/legal.ts (ou no texto em src/content/legal/) antes de publicar.');
  process.exit(1);
}

console.log(`Documentos jurídicos sem valores pendentes (${files.length} arquivos verificados).`);
