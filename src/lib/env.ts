import { z } from "zod";

/**
 * Variáveis de ambiente do servidor. Nunca importar em componentes client.
 * Segredos de provedores (SMTP, 17TRACK) ficam no banco (tabela settings, cifrados);
 * aqui só vivem os valores de bootstrap e as chaves da própria aplicação.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL obrigatória"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  /** >= 32 chars. Assina o cookie de sessão do admin e o cookie do comprador. */
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET precisa ter 32+ caracteres"),
  /** Chave AES-256-GCM em base64 (32 bytes). Cifra segredos gravados em settings. */
  APP_ENCRYPTION_KEY: z.string().min(32, "APP_ENCRYPTION_KEY em base64 (32 bytes)"),
  /** Token secreto que compõe a URL do webhook do checkout: /api/webhooks/checkout/<token> */
  CHECKOUT_WEBHOOK_TOKEN: z.string().min(16),
  /** Token exigido pelos endpoints /api/cron/* (header Authorization: Bearer). */
  CRON_SECRET: z.string().min(16),
  /** Admin inicial: criado só quando a tabela admin_users está vazia. */
  ADMIN_EMAIL: z.string().email().optional(),
  ADMIN_PASSWORD: z.string().min(10).optional(),
  /** Defaults de e-mail semeados em settings na primeira subida (podem ser trocados no painel). */
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().optional(),
  /** "true"/"false". z.coerce.boolean() faria Boolean("false") === true. */
  SMTP_SECURE: z.stringbool().optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM_NAME: z.string().optional(),
  EMAIL_FROM_ADDRESS: z.string().email().optional(),
  /** Chave do 17TRACK semeada em settings (opcional; pode ser colada no painel). */
  TRACKING_17TRACK_API_KEY: z.string().optional(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  // O docker-compose passa `${X:-}` como string vazia quando a variável não foi preenchida.
  // Vazio conta como ausente; senão um EMAIL_FROM_ADDRESS em branco derruba a aplicação inteira.
  const defined = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ""));
  const parsed = schema.safeParse(defined);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Configuração de ambiente inválida: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export const isProd = () => env().NODE_ENV === "production";
