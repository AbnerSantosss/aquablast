import type { Theme } from "@/lib/checkout/own/theme";

/** Rodapé do checkout (origem app/checkout.tsx, `footer.ck-footer`). `footerText` vem do tema (painel /admin/checkout). */
export function Footer({ theme, year }: { theme: Theme; year: number }) {
  return (
    <footer className="ck-footer">
      <strong>{theme.storeName}</strong>
      <span>{theme.footerText}</span>
      <small>
        © {year} {theme.storeName}
      </small>
    </footer>
  );
}
