import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TemplateEditor } from "@/components/admin/TemplateEditor";
import { requireAdmin } from "@/lib/auth/session";
import { DEFAULT_TEMPLATES, PLACEHOLDERS, getTemplate, type TemplateKey } from "@/lib/email/templates";
import { sampleVars } from "@/lib/admin/sample-vars";

export const metadata: Metadata = { title: "Editar template" };

export default async function TemplateEditPage({ params }: { params: Promise<{ key: string }> }) {
  const session = await requireAdmin();
  const { key } = await params;
  if (!(key in DEFAULT_TEMPLATES)) notFound();
  const tpl = await getTemplate(key as TemplateKey);
  const sample = await sampleVars();
  return (
    <>
      <div className="crumbs">
        <Link href="/admin/emails/templates">← Templates</Link>
      </div>
      <div className="page-head">
        <div>
          <h1>{tpl.name}</h1>
          <p className="sub">{tpl.description}</p>
        </div>
      </div>
      <TemplateEditor templateKey={tpl.key} initialSubject={tpl.subject} initialBody={tpl.bodyHtml} enabled={tpl.enabled} placeholders={PLACEHOLDERS} sample={sample} adminEmail={session.email} />
    </>
  );
}
