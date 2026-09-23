"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS: { href: string; label: string; match: (p: string) => boolean }[] = [
  { href: "/admin", label: "Pedidos", match: (p) => p === "/admin" || p.startsWith("/admin/pedidos") },
  { href: "/admin/webhooks", label: "Webhooks", match: (p) => p.startsWith("/admin/webhooks") },
  { href: "/admin/emails", label: "E-mails", match: (p) => p.startsWith("/admin/emails") },
  { href: "/admin/configuracoes", label: "Configurações", match: (p) => p.startsWith("/admin/configuracoes") },
];

export function NavLinks() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="nav" aria-label="Seções do painel">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={`nav-link ${l.match(pathname) ? "is-active" : ""}`} aria-current={l.match(pathname) ? "page" : undefined}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
