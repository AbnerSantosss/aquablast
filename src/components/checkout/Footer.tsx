import { CONTACT_EMAIL } from "@/lib/site/constants";
import type { Theme } from "@/lib/checkout/own/theme";

/** Rodapé do checkout (origem app/checkout.tsx). `footerText` vem do tema (painel /admin/checkout). */
export function Footer({ theme }: { theme: Theme }) {
  return (
    <footer className="ck-footer">
      <strong>{theme.storeName}</strong>
      <p>{theme.footerText}</p>
      <p>{CONTACT_EMAIL}</p>
    </footer>
  );
}
