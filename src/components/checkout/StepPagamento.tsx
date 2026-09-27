"use client";

import Image from "next/image";
import { Check, CreditCard, QrCode } from "lucide-react";
import { useState } from "react";
import { money } from "@/lib/checkout/own/masks";
import { COLOR_LABELS, KIT_PHOTO } from "@/lib/site/constants";
import type { Color } from "@/lib/site/types";
import type { Quote } from "@/lib/checkout/own/pricing";
import { isApiFail, postPay } from "./api";
import { PixPay } from "./PixPay";
import { CardPay } from "./CardPay";
import type { PayMethodUi, PixResult } from "./types";

/**
 * Etapa 3 — Pagamento (origem app/checkout.tsx, `body(2)`). Junta o order bump, o acordeão Pix/Cartão
 * (`.pay-acc`) e delega o formulário de cartão para `CardPay`. O Pix é iniciado aqui (POST /api/checkout/pay
 * com `method:"pix"`) porque não precisa de nenhum dado além do carrinho; o resultado vira `PixPay`.
 *
 * A 2ª unidade do bump sempre repete a MESMA cor da 1ª (ver OrderSummary.tsx e order.ts `effectiveSelection`
 * — não existe campo no banco para uma cor diferente), por isso o título abaixo usa a cor real do pedido,
 * nunca uma cor fixa como na origem ("Leve também uma AquaBlast preta").
 */
export function StepPagamento({
  cartToken,
  color,
  bump,
  onBumpChange,
  bumpEnabled,
  quotes,
  methods,
  method,
  onMethodChange,
  maxInstallments,
  pixGateway,
  cardGateway,
  cardPublicConfig,
  onPaid,
  onPending,
}: {
  cartToken: string;
  color: Color;
  bump: boolean;
  onBumpChange: (value: boolean) => void;
  bumpEnabled: boolean;
  quotes: { pix: Quote; card: Quote };
  methods: PayMethodUi[];
  method: PayMethodUi;
  onMethodChange: (method: PayMethodUi) => void;
  maxInstallments: number;
  pixGateway: string | null;
  cardGateway: string | null;
  cardPublicConfig: Record<string, string>;
  onPaid: (orderNumber: string, publicToken: string) => void;
  onPending: (message: string | null, orderNumber: string, publicToken: string) => void;
}) {
  const [pix, setPix] = useState<{ result: PixResult; orderNumber: string; publicToken: string } | null>(null);
  const [pixSubmitting, setPixSubmitting] = useState(false);
  const [pixError, setPixError] = useState<string | null>(null);

  const q = quotes[method];
  const testModePix = pixGateway === "simulado";
  const testModeCard = cardGateway === "simulado";

  const confirmPix = async () => {
    setPixSubmitting(true);
    setPixError(null);
    const result = await postPay({ cartToken, method: "pix", installments: 1, bump });
    setPixSubmitting(false);
    if (isApiFail(result)) {
      setPixError(result.error);
      return;
    }
    if (result.status === "paid") {
      onPaid(result.orderNumber, result.publicToken);
      return;
    }
    if (result.status === "pending" && result.pix) {
      setPix({ result: result.pix, orderNumber: result.orderNumber, publicToken: result.publicToken });
      return;
    }
    setPixError(result.message ?? "Não foi possível gerar o Pix. Tente de novo.");
  };

  return (
    <div className="ck-step-body">
      {bumpEnabled ? (
        <div className={`order-bump${bump ? " added" : ""}`} aria-label="Oferta opcional: segunda unidade">
          <label className="bump-choice">
            <span className={`ck-checkbox${bump ? " is-checked" : ""}`}>
              <input type="checkbox" checked={bump} onChange={(e) => onBumpChange(e.target.checked)} />
              {bump ? <Check aria-hidden="true" size={15} /> : null}
            </span>
            <span>{bump ? "ADICIONADO AO PEDIDO" : "SIM, QUERO ADICIONAR A SEGUNDA UNIDADE"}</span>
          </label>
          <div className="bump-product">
            <Image src={KIT_PHOTO.src} alt={KIT_PHOTO.alt} width={120} height={80} />
            <div>
              <em className="bump-tag">OFERTA DO KIT</em>
              <h4>Leve mais uma AquaBlast {COLOR_LABELS[color]}</h4>
              <strong className="bump-price">+ {money(q.bumpDeltaCents)}</strong>
              {q.bumpSavingCents > 0 ? <small>Economize {money(q.bumpSavingCents)} em relação à unidade avulsa</small> : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="pay-acc">
        {methods.includes("pix") ? (
          <div className={`pay-item${method === "pix" ? " is-open" : ""}`}>
            <label className="pay-head">
              <input type="radio" name="pay-method" checked={method === "pix"} onChange={() => onMethodChange("pix")} />
              <span className="pay-label">
                <QrCode aria-hidden="true" size={18} /> Pix
              </span>
            </label>
            {method === "pix" ? (
              <div className="pay-body">
                {testModePix ? <p className="ck-testmode">Modo de teste: nenhuma cobrança real será feita.</p> : null}
                {pix ? (
                  <PixPay
                    code={pix.result.code}
                    qrUrl={pix.result.qrUrl}
                    expiresAt={pix.result.expiresAt}
                    publicToken={pix.publicToken}
                    onRegenerate={() => void confirmPix()}
                    onPaid={() => onPaid(pix.orderNumber, pix.publicToken)}
                    regenerating={pixSubmitting}
                  />
                ) : (
                  <div className="payment-content">
                    <p>Ao confirmar, geramos um código Pix de {money(quotes.pix.amountCents)} para você pagar no app do seu banco.</p>
                    {pixError ? <p className="error">{pixError}</p> : null}
                    <div className="ck-actions">
                      <button type="button" className={`primary-button${pixSubmitting ? " spin" : ""}`} onClick={() => void confirmPix()} disabled={pixSubmitting}>
                        Confirmar com Pix
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {methods.includes("card") ? (
          <div className={`pay-item${method === "card" ? " is-open" : ""}`}>
            <label className="pay-head">
              <input type="radio" name="pay-method" checked={method === "card"} onChange={() => onMethodChange("card")} />
              <span className="pay-label">
                <CreditCard aria-hidden="true" size={18} /> Cartão de crédito
              </span>
            </label>
            {method === "card" ? (
              <div className="pay-body">
                {testModeCard ? <p className="ck-testmode">Modo de teste: nenhuma cobrança real será feita.</p> : null}
                <CardPay
                  cartToken={cartToken}
                  bump={bump}
                  amountCents={quotes.card.amountCents}
                  maxInstallments={maxInstallments}
                  gateway={cardGateway}
                  publicConfig={cardPublicConfig}
                  testMode={false}
                  onPending={onPending}
                  onPaid={onPaid}
                />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
