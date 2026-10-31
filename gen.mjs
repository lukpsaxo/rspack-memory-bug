// Generates N small TypeScript modules imported from one entry.
import fs from 'node:fs';

const count = Number(process.env.MODULES ?? 5000);
fs.rmSync('src', { recursive: true, force: true });
fs.mkdirSync('src/mods', { recursive: true });
const imports = [];
for (let i = 0; i < count; i++) {
  fs.writeFileSync(
    `src/mods/m${i}.ts`,
    `export const value${i}: number = ${i};\nexport function fn${i}(x: number): number {\n  return x + value${i};\n}\n`,
  );
  imports.push(`import { fn${i} } from './mods/m${i}';`);
}
fs.writeFileSync(
  'src/index.ts',
  `${imports.join('\n')}\nexport const total = [${Array.from({ length: count }, (_, i) => `fn${i}(1)`).join(', ')}].reduce((a, b) => a + b, 0);\n`,
);
console.log(`generated ${count} modules`);
