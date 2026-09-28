import Link from "next/link";
import { CreditCard, LockKeyhole } from "lucide-react";
import type { Theme } from "@/lib/checkout/own/theme";
import { RETURNS_PATH } from "@/lib/site/constants";
import { PixLogo } from "./PixLogo";
import { Brand } from "./TopBar";
import type { PayMethodUi } from "./types";

/**
 * Rodapé do checkout (pedido do dono, 2026-09-28: "precisa ter um footer, só mantenha o de pagamento que já
 * existe"). O bloco "Formas de pagamento" é o mesmo que ficava embaixo dos selos: só lista o que está ligado no
 * painel. Suporte = WhatsApp do painel ou, sem ele, o e-mail do site (mesma regra da compra confirmada).
 */
export function Footer({
  theme,
  year,
  methods,
  maxInstallments,
  support,
}: {
  theme: Theme;
  year: number;
  methods: PayMethodUi[];
  maxInstallments: number;
  support: { href: string; external: boolean };
}) {
  return (
    <footer className="ck-footer">
      <div className="container ck-footer-in">
        <div className="ck-footer-brand">
          <Brand storeName={theme.storeName} />
          <p>{theme.footerText}</p>
        </div>
        {methods.length > 0 ? (
          <div className="pay-methods">
            <h2>Formas de pagamento</h2>
            <div>
              {methods.includes("pix") ? (
                <em>
                  <PixLogo size={16} />
                  Pix
                </em>
              ) : null}
              {methods.includes("card") ? (
                <em>
                  <CreditCard size={16} aria-hidden="true" />
                  {maxInstallments > 1 ? `Cartão em até ${maxInstallments}x` : "Cartão de crédito"}
                </em>
              ) : null}
            </div>
          </div>
        ) : null}
        <nav className="ck-footer-nav" aria-label="Ajuda">
          <h2>Ajuda</h2>
          <Link href="/rastrear">Rastrear pedido</Link>
          <Link href={RETURNS_PATH}>Trocas e devoluções</Link>
          <a href={support.href} {...(support.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            Fale com a gente
          </a>
        </nav>
      </div>
      <div className="ck-footer-bottom">
        <div className="container">
          <small>
            © {year} {theme.storeName}
          </small>
          <span>
            <LockKeyhole size={14} aria-hidden="true" />
            Conexão protegida (HTTPS)
          </span>
        </div>
      </div>
    </footer>
  );
}
