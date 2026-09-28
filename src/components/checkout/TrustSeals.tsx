import Image from "next/image";
import { PixLogo } from "./PixLogo";
import type { PayMethodUi } from "./types";

type Seal = { id: string; img: string | null; title: string; text: string };

/**
 * Selos do checkout (pedido do dono, 2026-09-28: "os selos estão horríveis, use o nano banana"). As artes
 * de `public/checkout/selos/` foram geradas pela OpenRouter (scripts/checkout-selos-prompts.json) SEM texto;
 * o texto fica aqui, no HTML. Nenhum número inventado: "7 dias" é o direito de arrependimento do CDC
 * (art. 49) e as parcelas vêm de `checkout.maxInstallments`. Pix e Cartão só aparecem se estiverem ligados no painel.
 * O selo do Pix é o símbolo oficial (`PixLogo`), não arte gerada: pedido do dono no mesmo dia ("o selo do pix é esse").
 */
export function TrustSeals({ methods, maxInstallments }: { methods: PayMethodUi[]; maxInstallments: number }) {
  const seals: Seal[] = [
    ...(methods.includes("pix") ? [{ id: "pix", img: null, title: "Pix", text: "Aprovação na hora" }] : []),
    ...(methods.includes("card")
      ? [{ id: "card", img: "selo-cartao", title: "Cartão de crédito", text: maxInstallments > 1 ? `Até ${maxInstallments}x sem juros` : "À vista no cartão" }]
      : []),
    { id: "safe", img: "selo-seguro", title: "Compra segura", text: "Dados criptografados" },
    { id: "ship", img: "selo-envio", title: "Envio FULL", text: "Com rastreamento" },
    { id: "return", img: "selo-garantia", title: "Garantia de 7 dias", text: "Direito de arrependimento" },
  ];
  return (
    <section className="trust-seals" aria-label="Garantias da compra">
      <ul>
        {seals.map((s) => (
          <li key={s.id}>
            {s.img ? (
              <Image src={`/checkout/selos/${s.img}.webp`} width={56} height={56} alt="" />
            ) : (
              <span className="seal-pix">
                <PixLogo size={30} />
              </span>
            )}
            <span>
              <strong>{s.title}</strong>
              <small>{s.text}</small>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
