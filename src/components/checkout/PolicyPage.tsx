import Link from "next/link";
import { ArrowLeft, Mail } from "lucide-react";
import type { ReactNode } from "react";
import { CONTACT_EMAIL } from "@/lib/site/constants";
import { Brand } from "./TopBar";

export function PolicyPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <div className="ck ck-root ck-policy">
    <header className="container ck-policy-header"><Brand storeName="AquaBlast" /><Link href="/"><ArrowLeft size={16} aria-hidden="true" />Voltar à loja</Link></header>
    <main className="container ck-policy-main">
      <p className="ck-policy-eyebrow">INFORMAÇÕES DA LOJA</p><h1>{title}</h1><p className="ck-policy-intro">{intro}</p>
      <article className="ck-policy-body">{children}</article>
      <aside className="ck-policy-contact"><Mail size={22} aria-hidden="true" /><div><h2>Precisa de ajuda?</h2><a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a></div></aside>
    </main>
    <footer className="container ck-policy-footer"><span>AquaBlast · Diversão que aproxima.</span><nav aria-label="Informações da loja"><Link href="/trocas-e-devolucoes">Trocas e devoluções</Link><Link href="/politica-de-privacidade">Privacidade</Link><Link href="/condicoes-de-compra">Condições de compra</Link></nav></footer>
  </div>;
}
