"use client";

import { createContext, useContext, useState, useTransition, type ReactNode } from "react";
import { saveTracking } from "@/lib/admin/actions/tracking";

type Feedback = { ok: boolean; message: string; orderNumber: string } | null;

const FeedbackContext = createContext<(f: Feedback) => void>(() => {});

/**
 * Guarda o retorno do último "Salvar e avisar cliente" acima da tabela. Precisa ficar fora da linha:
 * quando o rastreio é salvo a linha sai da aba Pendentes (revalidatePath) e levaria a mensagem junto.
 */
export function ShipFeedbackProvider({ children }: { children: ReactNode }) {
  const [feedback, setFeedback] = useState<Feedback>(null);
  return (
    <FeedbackContext.Provider value={setFeedback}>
      {feedback ? (
        <div className={`flash ${feedback.ok ? "is-ok" : "is-err"}`} role="status" data-ship-feedback={feedback.ok ? "ok" : "err"}>
          <strong>{feedback.orderNumber}</strong>: {feedback.message}
        </div>
      ) : null}
      {children}
    </FeedbackContext.Provider>
  );
}

/** Formulário inline da aba Pendentes. Usa a mesma Server Action do detalhe do pedido (saveTracking). */
export function ShipForm({
  orderId,
  orderNumber,
  carriers,
  defaultCarrier,
}: {
  orderId: string;
  orderNumber: string;
  carriers: { code: number; name: string }[];
  defaultCarrier: number;
}) {
  const report = useContext(FeedbackContext);
  const [pending, startTransition] = useTransition();
  const submit = (formData: FormData) =>
    startTransition(async () => {
      try {
        const r = await saveTracking(null, formData);
        report(r ? { ok: r.ok, message: r.message, orderNumber } : null);
      } catch {
        report({ ok: false, message: "Não foi possível salvar agora. Recarregue a página e tente de novo.", orderNumber });
      }
    });
  return (
    <form className="ship-form" action={submit} data-pending={pending ? "true" : "false"} aria-label={`Rastreio do pedido ${orderNumber}`}>
      <input type="hidden" name="orderId" value={orderId} />
      <input
        className="ship-code"
        name="trackingCode"
        required
        maxLength={80}
        placeholder="Código de rastreio"
        aria-label={`Código de rastreio do pedido ${orderNumber}`}
        autoComplete="off"
        spellCheck={false}
        disabled={pending}
      />
      <select name="carrierCode" defaultValue={String(defaultCarrier)} aria-label={`Transportadora do pedido ${orderNumber}`} disabled={pending}>
        {carriers.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
      <button type="submit" className="btn btn-primary btn-sm" disabled={pending}>
        {pending ? "Salvando…" : "Salvar e avisar cliente"}
      </button>
    </form>
  );
}
