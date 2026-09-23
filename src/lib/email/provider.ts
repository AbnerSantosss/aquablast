import nodemailer from "nodemailer";
import { getSettings, type EmailProviderKind } from "@/lib/settings";

export interface OutgoingEmail {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

export interface EmailProvider {
  kind: EmailProviderKind;
  send(mail: OutgoingEmail): Promise<{ messageId: string | null }>;
  /** Testa credenciais sem enviar (quando o provedor permite). */
  verify(): Promise<void>;
}

type From = { name: string; address: string };

function smtpProvider(cfg: { host: string; port: number; secure: boolean; user: string; pass: string }, from: From): EmailProvider {
  const transport = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  return {
    kind: "smtp",
    async send(mail) {
      const info = await transport.sendMail({
        from: { name: from.name, address: from.address },
        to: mail.to,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        replyTo: mail.replyTo || undefined,
      });
      return { messageId: info.messageId ?? null };
    },
    async verify() {
      await transport.verify();
    },
  };
}

function resendProvider(apiKey: string, from: From): EmailProvider {
  return {
    kind: "resend",
    async send(mail) {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from: `${from.name} <${from.address}>`, to: [mail.to], subject: mail.subject, html: mail.html, text: mail.text, reply_to: mail.replyTo || undefined }),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { id?: string };
      return { messageId: data.id ?? null };
    },
    async verify() {
      const res = await fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!res.ok) throw new Error(`Resend rejeitou a chave (${res.status})`);
    },
  };
}

function brevoProvider(apiKey: string, from: From): EmailProvider {
  return {
    kind: "brevo",
    async send(mail) {
      const res = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: { "api-key": apiKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          sender: { name: from.name, email: from.address },
          to: [{ email: mail.to }],
          subject: mail.subject,
          htmlContent: mail.html,
          textContent: mail.text,
          replyTo: mail.replyTo ? { email: mail.replyTo } : undefined,
        }),
      });
      if (!res.ok) throw new Error(`Brevo ${res.status}: ${await res.text()}`);
      const data = (await res.json()) as { messageId?: string };
      return { messageId: data.messageId ?? null };
    },
    async verify() {
      const res = await fetch("https://api.brevo.com/v3/account", { headers: { "api-key": apiKey } });
      if (!res.ok) throw new Error(`Brevo rejeitou a chave (${res.status})`);
    },
  };
}

/** Monta o provedor ativo a partir das configurações do painel. */
export async function getEmailProvider(): Promise<EmailProvider> {
  const s = await getSettings([
    "email.provider",
    "email.from.name",
    "email.from.address",
    "email.smtp.host",
    "email.smtp.port",
    "email.smtp.secure",
    "email.smtp.user",
    "email.smtp.pass",
    "email.resend.apiKey",
    "email.brevo.apiKey",
  ] as const);
  const from: From = { name: s["email.from.name"], address: s["email.from.address"] || s["email.smtp.user"] };
  if (!from.address) throw new Error("Remetente de e-mail não configurado (Configurações → E-mail).");
  switch (s["email.provider"]) {
    case "resend":
      if (!s["email.resend.apiKey"]) throw new Error("Chave do Resend não configurada.");
      return resendProvider(s["email.resend.apiKey"], from);
    case "brevo":
      if (!s["email.brevo.apiKey"]) throw new Error("Chave do Brevo não configurada.");
      return brevoProvider(s["email.brevo.apiKey"], from);
    default:
      if (!s["email.smtp.host"]) throw new Error("Servidor SMTP não configurado.");
      return smtpProvider(
        { host: s["email.smtp.host"], port: s["email.smtp.port"], secure: s["email.smtp.secure"], user: s["email.smtp.user"], pass: s["email.smtp.pass"] },
        from,
      );
  }
}
