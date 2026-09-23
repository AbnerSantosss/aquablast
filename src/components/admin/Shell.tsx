import Link from "next/link";
import type { ReactNode } from "react";
import { logout } from "@/lib/admin/actions/auth";
import { NavLinks } from "./NavLinks";

export function Shell({ admin, children }: { admin: { name: string; email: string }; children: ReactNode }) {
  return (
    <div className="shell">
      <aside className="sidebar">
        <Link href="/admin" className="brand" aria-label="AquaBlast - painel">
          <span className="brand-mark">Aqua</span>
          <b>Blast</b>
          <small>painel</small>
        </Link>
        <NavLinks />
        <div className="sidebar-footer">
          <div className="admin-id">
            <strong>{admin.name}</strong>
            <span>{admin.email}</span>
          </div>
          <form action={logout}>
            <button type="submit" className="btn btn-sm btn-ghost">
              Sair
            </button>
          </form>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
