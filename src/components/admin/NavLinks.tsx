"use client";

import {
  CreditCard,
  Home,
  LayoutDashboard,
  Mail,
  Package,
  Palette,
  Receipt,
  Settings,
  ShoppingCart,
  Target,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean };
type NavEntry = { kind: "item"; item: NavItem } | { kind: "group"; label: string; items: NavItem[] };

/**
 * Menu do painel organizado em grupos (Fase 11.1, referência Zedy). Alguns itens (Produtos, Gateways,
 * Checkout > Personalizar, Marketing > Pixels) apontam para telas de outro agente ("painel-b") que ainda
 * não existem nesta rodada: o link fica pronto e passa a funcionar quando aquelas páginas forem criadas.
 */
const NAV: NavEntry[] = [
  { kind: "item", item: { href: "/admin", label: "Início", icon: Home, match: (p) => p === "/admin" } },
  { kind: "item", item: { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, match: (p) => p.startsWith("/admin/dashboard") } },
  {
    kind: "group",
    label: "Pedidos",
    items: [
      { href: "/admin/pedidos", label: "Vendas", icon: Receipt, match: (p) => p.startsWith("/admin/pedidos") },
      { href: "/admin/carrinhos", label: "Carrinhos abandonados", icon: ShoppingCart, match: (p) => p.startsWith("/admin/carrinhos") },
      { href: "/admin/clientes", label: "Clientes", icon: Users, match: (p) => p.startsWith("/admin/clientes") },
    ],
  },
  { kind: "item", item: { href: "/admin/produtos", label: "Produtos", icon: Package, match: (p) => p.startsWith("/admin/produtos") } },
  {
    kind: "group",
    label: "Marketing",
    items: [
      { href: "/admin/pixels", label: "Pixels", icon: Target, match: (p) => p.startsWith("/admin/pixels") },
      { href: "/admin/emails", label: "E-mails", icon: Mail, match: (p) => p.startsWith("/admin/emails") },
    ],
  },
  { kind: "item", item: { href: "/admin/gateways", label: "Gateways", icon: CreditCard, match: (p) => p.startsWith("/admin/gateways") } },
  {
    kind: "group",
    label: "Checkout",
    items: [{ href: "/admin/checkout", label: "Personalizar", icon: Palette, match: (p) => p.startsWith("/admin/checkout") }],
  },
  { kind: "item", item: { href: "/admin/webhooks", label: "Webhooks", icon: Webhook, match: (p) => p.startsWith("/admin/webhooks") } },
  { kind: "item", item: { href: "/admin/configuracoes", label: "Configurações", icon: Settings, match: (p) => p.startsWith("/admin/configuracoes") } },
];

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = item.match(pathname);
  const Icon = item.icon;
  return (
    <Link href={item.href} className={`nav-link ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
      <Icon size={16} aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  );
}

export function NavLinks() {
  const pathname = usePathname() ?? "";
  return (
    <nav className="nav" aria-label="Seções do painel">
      {NAV.map((entry, i) =>
        entry.kind === "item" ? (
          <NavLink key={entry.item.href} item={entry.item} pathname={pathname} />
        ) : (
          <div className="nav-group" key={`group-${i}`}>
            <span className="nav-group-label">{entry.label}</span>
            {entry.items.map((item) => (
              <NavLink key={item.href} item={item} pathname={pathname} />
            ))}
          </div>
        ),
      )}
    </nav>
  );
}
