/**
 * Props dos campos das telas de integração (Pixels, Gateways).
 * O Chrome ignora autoComplete="off" em campo de senha e punha o login do painel no token/segredo (29/09).
 * "new-password" tira o campo do preenchimento de login; data-1p-ignore / data-lpignore fazem o mesmo no 1Password e LastPass.
 * O servidor ainda recusa segredo igual à senha do painel (lib/admin/secret-guard.ts).
 */
export const SECRET_INPUT = { type: "password", autoComplete: "new-password", "data-1p-ignore": "", "data-lpignore": "true", spellCheck: false } as const;

/** Campos de texto de integração (IDs, hashes, chaves públicas): sem sugestão de login do navegador. */
export const PLAIN_INPUT = { autoComplete: "off", "data-1p-ignore": "", "data-lpignore": "true", spellCheck: false } as const;
