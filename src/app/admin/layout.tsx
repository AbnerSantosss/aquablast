import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./admin.css";

/**
 * O painel é também um app instalável ("AquaBlast Painel", pedido do dono em 2026-09-30): o manifest mora em
 * public/admin-app/ (fora de /admin/, que exige login: o navegador busca o manifest sem cookie). Fica aqui, e
 * não só no layout do painel, para o "Instalar app" aparecer já na tela de login. start_url /admin: sem
 * sessão, o proxy leva para /admin/login. Ver wiki/operacao/aquablast-app-vendas-pwa.md.
 */
export const metadata: Metadata = {
  title: { default: "Painel AquaBlast", template: "%s · Painel AquaBlast" },
  robots: { index: false, follow: false },
  manifest: "/admin-app/manifest.webmanifest",
  applicationName: "AquaBlast Painel",
  appleWebApp: { capable: true, title: "AquaBlast", statusBarStyle: "default" },
  icons: {
    icon: [
      { url: "/admin-app/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/admin-app/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/admin-app/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#063760",
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="admin">{children}</div>;
}
