import { z } from "zod";

/**
 * Validação das APIs do checkout próprio (Fase 4.5, zod 4).
 * O navegador NUNCA manda valor em dinheiro: manda pack, cores, bump, método e parcelas; o servidor calcula.
 */

export const colorSchema = z.enum(["azul", "vermelho", "preto"]);

export const selectionSchema = z
  .object({ pack: z.enum(["unit", "kit"]), colors: z.array(colorSchema).min(1).max(2) })
  .refine((s) => s.colors.length === (s.pack === "kit" ? 2 : 1), { error: "Cores não batem com o produto" });

/**
 * Identificadores de anúncio lidos no navegador (readAdIds de @/lib/tracking-ads/capture) + consentimento.
 * Só são gravados quando `consent === true` (ou quando `ads.consentRequired` está desligado no painel).
 * `gclid` e `utm` ficam guardados juntos em `checkout_carts.utm` (o gclid entra como chave "gclid").
 */
export const trackingSchema = z.object({
  consent: z.boolean(),
  fbp: z.string().max(200).optional(),
  fbc: z.string().max(500).optional(),
  gaClientId: z.string().max(100).optional(),
  gaSessionId: z.string().max(100).optional(),
  gclid: z.string().max(200).optional(),
  /** Só chaves utm_* (utm_source, utm_medium, utm_campaign, utm_term, utm_content...). Outras chaves são descartadas. */
  utm: z.record(z.string().max(40), z.string().max(200)).optional(),
});

export const customerSchema = z.object({
  name: z.string().trim().min(3).max(120),
  email: z.email().max(160),
  phone: z.string().min(10).max(20),
  cpf: z.string().min(11).max(14),
});

export const addressSchema = z.object({
  cep: z.string().min(8).max(9),
  street: z.string().trim().min(2).max(160),
  number: z.string().trim().min(1).max(20),
  extra: z.string().trim().max(80).optional(),
  district: z.string().trim().min(1).max(80),
  city: z.string().trim().min(2).max(80),
  state: z.string().trim().length(2),
  recipient: z.string().trim().min(3).max(120),
});

export const cartSchema = z.strictObject({
  token: z.string().max(80).optional(),
  selection: selectionSchema,
  step: z.enum(["dados", "entrega", "pagamento"]),
  bump: z.boolean().default(false),
  customer: customerSchema.optional(),
  address: addressSchema.optional(),
  tracking: trackingSchema.optional(),
});

/** Dados do cartão em claro. Só existem na memória da requisição POST /api/checkout/pay. NUNCA gravar nem logar. */
export const cardSchema = z.object({
  number: z.string().min(13).max(23),
  holderName: z.string().trim().min(3).max(80),
  expMonth: z.number().int().min(1).max(12),
  expYear: z.number().int().min(2026).max(2060),
  cvv: z.string().min(3).max(4),
  holderCpf: z.string().min(11).max(14),
});

export const paySchema = z.strictObject({
  cartToken: z.string().min(10).max(80),
  method: z.enum(["pix", "card"]),
  installments: z.number().int().min(1).max(12).default(1),
  bump: z.boolean().default(false),
  /** Só quando o gateway do cartão NÃO tokeniza no navegador (IronPay; FastPay se não tiver tokenização). */
  card: cardSchema.optional(),
  /** Só quando o gateway tokeniza no navegador (Mercado Pago): resultado de tokenizeCard(). */
  cardToken: z.string().max(200).optional(),
  cardBrand: z.string().max(30).optional(),
  cardPaymentMethodId: z.string().max(40).optional(),
  cardIssuerId: z.string().max(40).optional(),
  /** Últimos 4 dígitos quando o número não passa pelo servidor (gateway tokeniza). Só para payment_attempts.cardLast4. */
  cardLast4: z.string().regex(/^\d{4}$/).optional(),
});

export type CartInput = z.infer<typeof cartSchema>;
export type PayInput = z.infer<typeof paySchema>;
export type TrackingInput = z.infer<typeof trackingSchema>;
export type CustomerInput = z.infer<typeof customerSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type CardInput = z.infer<typeof cardSchema>;

/** Primeiro erro do zod em pt-BR simples, com o caminho do campo (para 400 { ok:false, error, field }). */
export function describeInputError(error: z.ZodError): { field: string; message: string } {
  const issue = error.issues[0];
  if (!issue) return { field: "", message: "Dados inválidos." };
  const field = issue.path.map(String).join(".");
  if (issue.code === "unrecognized_keys") return { field, message: `Campo não reconhecido: ${issue.keys.join(", ")}.` };
  return { field, message: field ? `Campo inválido: ${field}.` : "Dados inválidos." };
}
