import Link from "next/link";
import { Droplets, Sun } from "lucide-react";
import type { Theme } from "@/lib/checkout/own/theme";

export function Brand({ storeName }: { storeName: string }) {
  return (
    <Link className="brand" href="/" aria-label={`${storeName} início`}>
      <Droplets aria-hidden="true" />
      <span>{storeName}</span>
    </Link>
  );
}

/** A oferta de verão não tem data nem contagem regressiva. */
export function TopBar({ theme }: { theme: Theme }) {
  return (
    <header className="ck-top">
      <Brand storeName={theme.storeName} />
      <div className="ck-season-badge"><Sun size={16} aria-hidden="true" /><span>Oferta de Verão</span></div>
    </header>
  );
}
