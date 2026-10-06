import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

const source = await readFile(new URL("../src/lib/checkout/own/masks.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
const { maskPhone, validMobile } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

// Usa o TypeScript já instalado no projeto e testa o código real, sem depender de um navegador.
// Execute: node scripts/test-checkout-phone.mjs
const cases = [
  ["11998765432", "(11) 99876-5432", true],
  ["(11) 99876-5432", "(11) 99876-5432", true],
  ["+55 (11) 99876-5432", "(11) 99876-5432", true],
  ["5511998765432", "(11) 99876-5432", true],
  ["55998765432", "(55) 99876-5432", true],
  ["+55 (55) 99876-5432", "(55) 99876-5432", true],
  ["", "", false],
  ["11", "(11", false],
  ["119987", "(11) 9987", false],
  ["1112345678", "(11) 1234-5678", false],
  ["+55 (01) 99876-5432", "(01) 99876-5432", false],
];

for (const [input, expected, valid] of cases) {
  const masked = maskPhone(input);
  assert.equal(masked, expected, `Máscara de ${input}`);
  assert.equal(validMobile(masked), valid, `Validação de ${input}`);
  assert.equal(maskPhone(masked), masked, `Máscara idempotente de ${input}`);
}

process.stdout.write(`Telefone: ${cases.length} cenários passaram.\n`);
