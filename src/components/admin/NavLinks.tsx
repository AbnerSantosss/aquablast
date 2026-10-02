"use client";

import {
  BellRing,
  CreditCard,
  Home,
  LayoutDashboard,
  Mail,
  MousePointerClick,
  Package,
  Palette,
  Receipt,
  Settings,
  ShoppingCart,
  Target,
  Truck,
  Users,
  Webhook,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import "@/app/admin/envios-admin.css";

type NavItem = { href: string; label: string; icon: LucideIcon; match: (p: string) => boolean; badge?: "slaLate" };
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
      { href: "/admin/envios", label: "Envios", icon: Truck, match: (p) => p.startsWith("/admin/envios"), badge: "slaLate" },
      { href: "/admin/cliques", label: "Cliques no Comprar", icon: MousePointerClick, match: (p) => p.startsWith("/admin/cliques") },
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
  // App instalável + avisos no celular (PWA, pedido do dono em 2026-09-30).
  { kind: "item", item: { href: "/admin/app", label: "App e avisos", icon: BellRing, match: (p) => p.startsWith("/admin/app") } },
];

function NavLink({ item, pathname, count = 0 }: { item: NavItem; pathname: string; count?: number }) {
  const active = item.match(pathname);
  const Icon = item.icon;
  const late = item.badge === "slaLate" && count > 0;
  return (
    <Link href={item.href} className={`nav-link ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}>
      <Icon size={16} aria-hidden="true" />
      <span>{item.label}</span>
      {late ? (
        <span className="nav-badge" title={`${count} pedido(s) passaram do prazo de postagem`}>
          {count}
          <span className="nav-badge-sr"> {count === 1 ? "pedido atrasado" : "pedidos atrasados"}</span>
        </span>
      ) : null}
    </Link>
  );
}

/** `slaLate`: pedidos pagos sem rastreio que passaram do prazo de postagem (calculado no layout, no servidor). */
export function NavLinks({ slaLate = 0 }: { slaLate?: number }) {
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
              <NavLink key={item.href} item={item} pathname={pathname} count={item.badge === "slaLate" ? slaLate : 0} />
            ))}
          </div>
        ),
      )}
    </nav>
  );
}
