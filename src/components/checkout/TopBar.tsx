import Link from "next/link";
import { Droplets, ShieldCheck } from "lucide-react";
import type { Theme } from "@/lib/checkout/own/theme";
import styles from "./TopBar.module.css";

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
    <header className={`${styles.top} ck-top`}>
      <Brand storeName={theme.storeName} />
      <div className={`${styles.protection} ck-season-badge`}><ShieldCheck size={20} aria-hidden="true" /><span>Ambiente <strong>protegido</strong></span></div>
    </header>
  );
}
