import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    // Build de verificação em pasta separada (NEXT_DIST_DIR=.next-build), para não derrubar o dev.
    ".next-*/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Rascunhos da geração de imagens (fontes, prompts, relatórios); fora do git.
    "outputs/**",
  ]),
]);

export default eslintConfig;
