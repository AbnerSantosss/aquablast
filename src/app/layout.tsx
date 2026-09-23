import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BASE_URL } from "@/lib/site/base-url";

/**
 * Layout raiz propositalmente vazio: o site (grupo "(site)") e o painel ("admin")
 * carregam seus próprios CSS e fontes para não contaminar um ao outro.
 * Só o `metadataBase` mora aqui, para que URLs relativas de OG/canonical resolvam.
 */
export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
