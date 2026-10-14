"use server";

import { createHash, randomBytes } from "node:crypto";
import { count, eq, like } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { checkoutCarts, companies, DEFAULT_COMPANY_ID, orders, settings } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { encryptText } from "@/lib/crypto";
import { actorOf, audit } from "@/lib/admin/audit";
import { bool, int, str } from "@/lib/admin/form";
import { looksLikeEmail, rejectPanelPassword } from "@/lib/admin/secret-guard";
import { fail, ok, type ActionResult } from "@/lib/admin/types";
import { getCompanyById } from "@/lib/companies";
import { describeThemeError, localInputToIso, themeDefaults, themeSchema } from "@/lib/checkout/own/theme";
import { isGatewayName } from "@/lib/gateways";
import { isSecretKey, setCompanySetting, type SettingKey, type SettingsMap } from "@/lib/settings";

/**
 * Ações do painel de Empresas (gateway multiempresa, 2026-10-13, agente P).
 * Cadastro, chave de API (mostrada uma vez), webhook de saída, origens liberadas e as configurações de checkout
 * e gateway por empresa (`company:<id>:<chave>`, via setCompanySetting). O AquaBlast (empresa padrão) tem as
 * telas globais de sempre: aqui ele só tem os dados da empresa, sem formulário de checkout/gateway.
 */

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Slugs que colidiriam com rotas ou com o próprio painel. */
const RESERVED_SLUGS = new Set(["api", "admin", "checkout", "c", "new", "novo"]);

async function begin() {
  const session = await requireAdmin();
  await ensureBootstrap();
  return { adminId: session.sub, actor: actorOf(session) };
}

function revalidateCompany(id: string, slug?: string) {
  revalidatePath("/admin/empresas");
  revalidatePath(`/admin/empresas/${id}`);
  revalidatePath(`/admin/empresas/${id}/checkout`);
  if (slug) revalidatePath(`/c/${slug}`);
}

/** Origem (esquema + host + porta) normalizada, ou null. http só para localhost. */
function normalizeOrigin(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
  if (u.username || u.password) return null;
  return u.origin;
}

/** Webhook de saída: https (ou http em localhost, para teste), sem credenciais na URL. */
function validWebhookUrl(raw: string): string | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (u.protocol !== "https:" && !(u.protocol === "http:" && local)) return null;
  if (u.username || u.password) return null;
  return u.toString();
}

export async function createCompany(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const slug = str(fd, "slug", 40).toLowerCase();
  const name = str(fd, "name", 80);
  const active = bool(fd, "active");
  if (!SLUG_RE.test(slug) || slug.length < 2) return fail("Slug inválido: use 2 a 40 letras minúsculas, números e hífens (ex.: loja-do-joao).");
  if (RESERVED_SLUGS.has(slug)) return fail("Esse slug é reservado. Escolha outro.");
  if (name.length < 2) return fail("Informe o nome da empresa.");
  const exists = await db.query.companies.findFirst({ where: eq(companies.slug, slug), columns: { id: true } });
  if (exists) return fail("Já existe uma empresa com esse slug.");
  const [row] = await db.insert(companies).values({ slug, name, active }).returning({ id: companies.id });
  await audit(actor, "company.create", { type: "company", id: row.id }, { slug, active });
  revalidatePath("/admin/empresas");
  redirect(`/admin/empresas/${row.id}`);
}

export async function saveCompanyData(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const id = str(fd, "companyId", 64);
  const company = await getCompanyById(id);
  if (!company) return fail("Empresa não encontrada.");
  const isDefault = company.id === DEFAULT_COMPANY_ID;

  const name = str(fd, "name", 80);
  if (name.length < 2) return fail("Informe o nome da empresa.");
  // O AquaBlast é a empresa padrão: desativá-la derrubaria o /c/aquablast e a API dela.
  const active = isDefault ? true : bool(fd, "active");

  const webhookRaw = str(fd, "webhookUrl", 500);
  let webhookUrl: string | null = null;
  if (webhookRaw) {
    webhookUrl = validWebhookUrl(webhookRaw);
    if (!webhookUrl) return fail("Webhook inválido: use uma URL https:// (http só para localhost), sem usuário e senha na URL.");
  }

  const originsRaw = str(fd, "allowedOrigins", 4000);
  const origins: string[] = [];
  for (const line of originsRaw.split(/[\n,]+/)) {
    const t = line.trim();
    if (!t) continue;
    const origin = normalizeOrigin(t);
    if (!origin) return fail(`Origem inválida: "${t}". Use https://dominio.com (sem caminho); http só para localhost.`);
    if (!origins.includes(origin)) origins.push(origin);
  }
  if (origins.length > 20) return fail("No máximo 20 origens.");

  await db
    .update(companies)
    .set({ name, active, webhookUrl, allowedOrigins: origins, updatedAt: new Date() })
    .where(eq(companies.id, company.id));
  await audit(actor, "company.update", { type: "company", id: company.id }, { active, hasWebhook: Boolean(webhookUrl), origins: origins.length });
  revalidateCompany(company.id, company.slug);
  return ok("Dados da empresa salvos.");
}

/** Gera (ou troca) a chave de API. A chave em claro aparece uma única vez; no banco ficam só o SHA-256 e o prefixo. */
export async function generateCompanyApiKey(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const company = await getCompanyById(str(fd, "companyId", 64));
  if (!company) return fail("Empresa não encontrada.");
  const key = `abk_${randomBytes(24).toString("hex")}`;
  const hash = createHash("sha256").update(key).digest("hex");
  await db
    .update(companies)
    .set({ apiKeyHash: hash, apiKeyPrefix: key.slice(0, 8), updatedAt: new Date() })
    .where(eq(companies.id, company.id));
  await audit(actor, company.apiKeyHash ? "company.apikey.regenerate" : "company.apikey.create", { type: "company", id: company.id }, { prefix: key.slice(0, 8) });
  revalidateCompany(company.id);
  return ok("Chave de API gerada. Copie agora: ela não será mostrada de novo e a anterior (se havia) deixou de valer.", { code: key });
}

export async function revokeCompanyApiKey(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const company = await getCompanyById(str(fd, "companyId", 64));
  if (!company) return fail("Empresa não encontrada.");
  await db.update(companies).set({ apiKeyHash: null, apiKeyPrefix: null, updatedAt: new Date() }).where(eq(companies.id, company.id));
  await audit(actor, "company.apikey.revoke", { type: "company", id: company.id });
  revalidateCompany(company.id);
  return ok("Chave de API revogada. A integração dessa empresa deixa de funcionar até gerar outra.");
}

/** Segredo do webhook de saída (HMAC). Digitado ou gerado; cifrado em repouso. Em branco no formulário = manter o atual. */
export async function saveCompanyWebhookSecret(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { adminId, actor } = await begin();
  const company = await getCompanyById(str(fd, "companyId", 64));
  if (!company) return fail("Empresa não encontrada.");
  const generate = str(fd, "mode", 10) === "generate";
  const secret = generate ? `whsec_${randomBytes(24).toString("hex")}` : str(fd, "webhookSecret", 300);
  if (!secret) return ok("Nada para salvar: o segredo atual foi mantido.");
  if (!generate) {
    const problem = await rejectPanelPassword(adminId, { "Segredo do webhook": secret });
    if (problem) return fail(problem);
    if (secret.length < 16) return fail("Use um segredo com pelo menos 16 caracteres (ou gere um).");
  }
  await db.update(companies).set({ webhookSecret: encryptText(secret), updatedAt: new Date() }).where(eq(companies.id, company.id));
  await audit(actor, "company.webhookSecret.update", { type: "company", id: company.id }, { generated: generate });
  revalidateCompany(company.id);
  return generate
    ? ok("Segredo gerado. Copie agora: ele não será mostrado de novo. Use-o para conferir a assinatura (HMAC) dos webhooks.", { code: secret })
    : ok("Segredo do webhook salvo.");
}

/** Apaga a empresa e o catálogo dela. Recusa o AquaBlast e qualquer empresa que já tenha pedidos ou carrinhos. */
export async function deleteCompany(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor } = await begin();
  const company = await getCompanyById(str(fd, "companyId", 64));
  if (!company) return fail("Empresa não encontrada.");
  if (company.id === DEFAULT_COMPANY_ID) return fail("A empresa AquaBlast é a empresa padrão e não pode ser apagada.");
  if (str(fd, "confirmSlug", 40) !== company.slug) return fail("Para apagar, digite o slug da empresa no campo de confirmação.");
  const [{ value: nOrders }] = await db.select({ value: count() }).from(orders).where(eq(orders.companyId, company.id));
  const [{ value: nCarts }] = await db.select({ value: count() }).from(checkoutCarts).where(eq(checkoutCarts.companyId, company.id));
  if (nOrders > 0 || nCarts > 0) {
    return fail(`Esta empresa tem ${nOrders} pedido(s) e ${nCarts} carrinho(s). Para preservar o histórico, desative-a em vez de apagar.`);
  }
  await db.delete(settings).where(like(settings.key, `company:${company.id}:%`));
  await db.delete(companies).where(eq(companies.id, company.id));
  await audit(actor, "company.delete", { type: "company", id: company.id }, { slug: company.slug });
  revalidatePath("/admin/empresas");
  redirect("/admin/empresas");
}

/* ------------------------------------------------------------------------------------------------
 * Checkout e gateway por empresa (setCompanySetting). Nunca para o AquaBlast: ele usa as telas globais.
 * ---------------------------------------------------------------------------------------------- */

async function beginScoped(fd: FormData) {
  const ctx = await begin();
  const company = await getCompanyById(str(fd, "companyId", 64));
  if (!company) return { ...ctx, company: null, error: fail("Empresa não encontrada.") };
  if (company.id === DEFAULT_COMPANY_ID) {
    return { ...ctx, company: null, error: fail("O AquaBlast usa as telas globais (Gateways, Personalizar checkout, Configurações).") };
  }
  return { ...ctx, company, error: null };
}

type Patch = Partial<SettingsMap>;

async function applyScoped(actor: string, companyId: string, section: string, patch: Patch): Promise<void> {
  const changed: string[] = [];
  for (const [k, v] of Object.entries(patch) as [SettingKey, SettingsMap[SettingKey]][]) {
    // Segredo em branco = manter o atual (mesma regra das telas globais).
    if (isSecretKey(k) && (v === "" || v === undefined || v === null)) continue;
    await setCompanySetting(companyId, k, v as never, actor);
    changed.push(k);
  }
  await audit(actor, "company.settings.update", { type: "company", id: companyId }, { section, keys: changed });
}

export async function saveCompanyTheme(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor, company, error } = await beginScoped(fd);
  if (!company) return error;
  const input: Record<string, unknown> = {};
  for (const key of Object.keys(themeDefaults)) {
    const def = themeDefaults[key as keyof typeof themeDefaults];
    if (typeof def === "boolean") input[key] = bool(fd, key);
    else input[key] = str(fd, key, 500);
  }
  input.timerEnd = localInputToIso(str(fd, "timerEnd", 40)) || input.timerEnd;
  const parsed = themeSchema.safeParse(input);
  if (!parsed.success) {
    const { field, message } = describeThemeError(parsed.error);
    return fail(message, field ? { fields: { [field]: message } } : {});
  }
  await setCompanySetting(company.id, "checkout.theme", parsed.data, actor);
  await audit(actor, "company.settings.update", { type: "company", id: company.id }, { section: "checkout.theme", keys: ["checkout.theme"] });
  revalidateCompany(company.id, company.slug);
  return ok("Aparência do checkout da empresa salva.");
}

export async function saveCompanyCheckoutOptions(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor, company, error } = await beginScoped(fd);
  if (!company) return error;
  await applyScoped(actor, company.id, "checkout.options", {
    "checkout.maxInstallments": int(fd, "checkout.maxInstallments", 12, 1, 12),
    "checkout.pixTtlSeconds": int(fd, "checkout.pixTtlSeconds", 600, 60, 86_400),
  });
  revalidateCompany(company.id, company.slug);
  return ok("Parcelamento e validade do Pix salvos.");
}

export async function saveCompanyRouting(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor, company, error } = await beginScoped(fd);
  if (!company) return error;
  const pix = str(fd, "gateway.pix", 20);
  const card = str(fd, "gateway.card", 20);
  if (!isGatewayName(pix)) return fail("Escolha um gateway válido para o Pix.");
  if (card !== "desligado" && !isGatewayName(card)) return fail("Escolha um gateway válido para o cartão (ou desligado).");
  await applyScoped(actor, company.id, "gateway.routing", {
    "gateway.pix": pix as SettingsMap["gateway.pix"],
    "gateway.card": card as SettingsMap["gateway.card"],
    "checkout.cardComingSoon": bool(fd, "checkout.cardComingSoon"),
  });
  revalidateCompany(company.id, company.slug);
  return ok("Roteamento de pagamento da empresa salvo.");
}

async function autofillProblem(adminId: string, secrets: Record<string, string>, plain: Record<string, string>): Promise<string | null> {
  const email = Object.entries(plain).find(([, v]) => looksLikeEmail(v));
  if (email) return `O campo "${email[0]}" está com um e-mail (preenchimento automático do navegador). Apague e cole o valor certo.`;
  return rejectPanelPassword(adminId, secrets);
}

export async function saveCompanyIronpay(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { adminId, actor, company, error } = await beginScoped(fd);
  if (!company) return error;
  const patch = {
    "gateway.ironpay.apiToken": str(fd, "gateway.ironpay.apiToken", 500),
    "gateway.ironpay.offerHashUnit": str(fd, "gateway.ironpay.offerHashUnit", 200),
    "gateway.ironpay.offerHashKit": str(fd, "gateway.ironpay.offerHashKit", 200),
    "gateway.ironpay.productHashUnit": str(fd, "gateway.ironpay.productHashUnit", 200),
    "gateway.ironpay.productHashKit": str(fd, "gateway.ironpay.productHashKit", 200),
  };
  const problem = await autofillProblem(
    adminId,
    { "Token da API": patch["gateway.ironpay.apiToken"] },
    {
      "Offer hash — unidade": patch["gateway.ironpay.offerHashUnit"],
      "Offer hash — kit": patch["gateway.ironpay.offerHashKit"],
      "Product hash — unidade": patch["gateway.ironpay.productHashUnit"],
      "Product hash — kit": patch["gateway.ironpay.productHashKit"],
    },
  );
  if (problem) return fail(problem);
  await applyScoped(actor, company.id, "gateway.ironpay", patch);
  revalidateCompany(company.id);
  return ok("Credenciais da IronPay da empresa salvas. Segredo em branco foi mantido.");
}

export async function saveCompanyMercadopago(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { adminId, actor, company, error } = await beginScoped(fd);
  if (!company) return error;
  const patch = {
    "gateway.mercadopago.accessToken": str(fd, "gateway.mercadopago.accessToken", 500),
    "gateway.mercadopago.publicKey": str(fd, "gateway.mercadopago.publicKey", 300),
    "gateway.mercadopago.webhookSecret": str(fd, "gateway.mercadopago.webhookSecret", 500),
  };
  const problem = await autofillProblem(
    adminId,
    { "Access token": patch["gateway.mercadopago.accessToken"], "Webhook secret": patch["gateway.mercadopago.webhookSecret"] },
    { "Public key": patch["gateway.mercadopago.publicKey"] },
  );
  if (problem) return fail(problem);
  await applyScoped(actor, company.id, "gateway.mercadopago", patch);
  revalidateCompany(company.id);
  return ok("Credenciais do Mercado Pago da empresa salvas. Segredos em branco foram mantidos.");
}

export async function saveCompanyFastpay(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { adminId, actor, company, error } = await beginScoped(fd);
  if (!company) return error;
  const apiKey = str(fd, "gateway.fastpay.apiKey", 500);
  const problem = await autofillProblem(adminId, { "Chave de API": apiKey }, {});
  if (problem) return fail(problem);
  await applyScoped(actor, company.id, "gateway.fastpay", { "gateway.fastpay.apiKey": apiKey });
  revalidateCompany(company.id);
  return ok("Credencial da FastPay da empresa salva. Segredo em branco foi mantido.");
}

/** Dados de contato da loja da empresa (store.*). Sempre grava os quatro, mesmo vazios, para não herdar os do AquaBlast. */
export async function saveCompanyStore(_prev: ActionResult, fd: FormData): Promise<ActionResult> {
  const { actor, company, error } = await beginScoped(fd);
  if (!company) return error;
  const whatsapp = str(fd, "store.supportWhatsapp", 30).replace(/\D/g, "");
  if (whatsapp && (whatsapp.length < 10 || whatsapp.length > 15)) return fail("WhatsApp: use de 10 a 15 dígitos com DDI e DDD (ex.: 5511999999999), ou deixe em branco.");
  const email = str(fd, "store.supportEmail", 254);
  if (email && !looksLikeEmail(email)) return fail("E-mail de suporte inválido.");
  const tracking = str(fd, "store.trackingPageUrl", 500);
  if (tracking && !/^(https:\/\/|\/(?!\/))/.test(tracking)) return fail("Página de rastreio: use https://... ou um caminho que comece com /.");
  const name = str(fd, "store.name", 100);
  if (name.length < 2) return fail("Informe o nome da loja.");
  await applyScoped(actor, company.id, "store", {
    "store.name": name,
    "store.supportEmail": email,
    "store.supportWhatsapp": whatsapp,
    "store.trackingPageUrl": tracking,
  });
  revalidateCompany(company.id, company.slug);
  return ok("Dados da loja da empresa salvos.");
}
