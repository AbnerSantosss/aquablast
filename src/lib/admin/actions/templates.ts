"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { emailLog, emailTemplates } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/session";
import { ensureBootstrap } from "@/lib/bootstrap";
import { getEmailProvider } from "@/lib/email/provider";
import { DEFAULT_TEMPLATES, getTemplate, htmlToText, renderTemplate, type TemplateKey } from "@/lib/email/templates";
import { getSettings } from "@/lib/settings";
import { actorOf, audit } from "@/lib/admin/audit";
import { bool, str } from "@/lib/admin/form";
import { sampleVars } from "@/lib/admin/sample-vars";
import { fail, ok, type ActionResult } from "@/lib/admin/types";

const isTemplateKey = (k: string): k is TemplateKey => k in DEFAULT_TEMPLATES;

export async function saveTemplate(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  await ensureBootstrap();
  const key = str(formData, "key", 50);
  if (!isTemplateKey(key)) return fail("Template inválido.");
  const subject = str(formData, "subject", 300);
  const bodyHtml = (formData.get("bodyHtml") as string | null)?.slice(0, 200_000) ?? "";
  if (!subject) return fail("Informe o assunto.");
  if (!bodyHtml.trim()) return fail("O corpo do e-mail não pode ficar vazio.");
  const enabled = bool(formData, "enabled");
  await db
    .insert(emailTemplates)
    .values({ key, name: DEFAULT_TEMPLATES[key].name, description: DEFAULT_TEMPLATES[key].description, subject, bodyHtml, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({ target: emailTemplates.key, set: { subject, bodyHtml, enabled, updatedAt: new Date() } });
  await audit(actorOf(session), "template.save", { type: "email_template", id: key }, { enabled });
  revalidatePath("/admin/emails/templates");
  revalidatePath(`/admin/emails/templates/${key}`);
  return ok("Template salvo.");
}

export async function toggleTemplate(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  await ensureBootstrap();
  const key = str(formData, "key", 50);
  if (!isTemplateKey(key)) return fail("Template inválido.");
  const current = await getTemplate(key);
  const enabled = !current.enabled;
  await db
    .insert(emailTemplates)
    .values({ key, name: current.name, description: current.description, subject: current.subject, bodyHtml: current.bodyHtml, enabled, updatedAt: new Date() })
    .onConflictDoUpdate({ target: emailTemplates.key, set: { enabled, updatedAt: new Date() } });
  await audit(actorOf(session), "template.toggle", { type: "email_template", id: key }, { enabled });
  revalidatePath("/admin/emails/templates");
  revalidatePath(`/admin/emails/templates/${key}`);
  return ok(enabled ? "Envio automático ligado." : "Envio automático desligado.");
}

export async function restoreTemplate(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  await ensureBootstrap();
  const key = str(formData, "key", 50);
  if (!isTemplateKey(key)) return fail("Template inválido.");
  const d = DEFAULT_TEMPLATES[key];
  await db
    .insert(emailTemplates)
    .values({ key, name: d.name, description: d.description, subject: d.subject, bodyHtml: d.bodyHtml, enabled: d.enabled, updatedAt: new Date() })
    .onConflictDoUpdate({ target: emailTemplates.key, set: { subject: d.subject, bodyHtml: d.bodyHtml, updatedAt: new Date() } });
  await audit(actorOf(session), "template.restore", { type: "email_template", id: key });
  revalidatePath("/admin/emails/templates");
  revalidatePath(`/admin/emails/templates/${key}`);
  return ok("Template restaurado para o padrão.");
}

/** Envia o template (com dados de exemplo) para o e-mail do admin logado. */
export async function sendTemplateTest(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const session = await requireAdmin();
  await ensureBootstrap();
  const key = str(formData, "key", 50);
  if (!isTemplateKey(key)) return fail("Template inválido.");
  // Usa o que está no formulário (ainda não salvo) para o admin testar antes de gravar.
  const tpl = await getTemplate(key);
  const subjectSrc = str(formData, "subject", 300) || tpl.subject;
  const bodySrc = ((formData.get("bodyHtml") as string | null)?.slice(0, 200_000) ?? "").trim() || tpl.bodyHtml;
  const vars = await sampleVars();
  const subject = `[TESTE] ${renderTemplate(subjectSrc, vars)}`;
  const html = renderTemplate(bodySrc, vars);
  const s = await getSettings(["email.provider", "email.replyTo"] as const);
  const triggeredBy = actorOf(session);
  try {
    const provider = await getEmailProvider();
    const { messageId } = await provider.send({ to: session.email, subject, html, text: htmlToText(html), replyTo: s["email.replyTo"] });
    await db.insert(emailLog).values({ to: session.email, templateKey: `test:${key}`, subject, provider: provider.kind, status: "sent", messageId, triggeredBy });
    revalidatePath("/admin/emails");
    return ok(`Teste enviado para ${session.email}.`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await db.insert(emailLog).values({ to: session.email, templateKey: `test:${key}`, subject, provider: s["email.provider"], status: "error", error: message, triggeredBy });
    revalidatePath("/admin/emails");
    return fail(`Falha no envio: ${message}`);
  }
}
