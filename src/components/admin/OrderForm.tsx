"use client";

import { useActionState } from "react";
import { createManualOrder } from "@/lib/admin/actions/orders";

export interface OrderFormValues {
  orderNumber?: string;
  externalId?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerDocument?: string;
  addressLine1?: string;
  addressLine2?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
  addressPostalCode?: string;
  addressCountry?: string;
  items?: string;
  amountTotal?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  pixCode?: string;
  paymentUrl?: string;
}

const PAYMENT_OPTIONS: [string, string][] = [
  ["pending", "Aguardando pagamento"],
  ["paid", "Pago"],
  ["refused", "Recusado"],
  ["refunded", "Estornado"],
  ["chargeback", "Chargeback"],
  ["cancelled", "Cancelado"],
  ["expired", "Expirado"],
];

export function OrderForm({ initial, deliveryId }: { initial: OrderFormValues; deliveryId?: string }) {
  const [state, formAction, pending] = useActionState(createManualOrder, null);
  const err = (name: string) => (state?.fields?.[name] ? <span className="field-error">{state.fields[name]}</span> : null);
  const v = (k: keyof OrderFormValues) => initial[k] ?? "";

  return (
    <form action={formAction} className="card order-form">
      {deliveryId ? <input type="hidden" name="deliveryId" value={deliveryId} /> : null}
      <fieldset disabled={pending} className="af-fields">
        <h2 className="section-title">Cliente</h2>
        <div className="grid-2">
          <label className="field">
            <span>Nome *</span>
            <input name="customerName" defaultValue={v("customerName")} required maxLength={200} />
            {err("customerName")}
          </label>
          <label className="field">
            <span>E-mail</span>
            <input name="customerEmail" type="email" defaultValue={v("customerEmail")} maxLength={254} />
            {err("customerEmail")}
          </label>
          <label className="field">
            <span>Telefone / WhatsApp</span>
            <input name="customerPhone" defaultValue={v("customerPhone")} maxLength={40} placeholder="(81) 99999-9999" />
          </label>
          <label className="field">
            <span>CPF (guardado cifrado)</span>
            <input name="customerDocument" defaultValue={v("customerDocument")} maxLength={20} inputMode="numeric" />
          </label>
        </div>

        <h2 className="section-title">Endereço de entrega</h2>
        <div className="grid-2">
          <label className="field span-2">
            <span>Rua e número</span>
            <input name="addressLine1" defaultValue={v("addressLine1")} maxLength={200} />
          </label>
          <label className="field">
            <span>Complemento</span>
            <input name="addressLine2" defaultValue={v("addressLine2")} maxLength={200} />
          </label>
          <label className="field">
            <span>Bairro</span>
            <input name="addressNeighborhood" defaultValue={v("addressNeighborhood")} maxLength={120} />
          </label>
          <label className="field">
            <span>Cidade</span>
            <input name="addressCity" defaultValue={v("addressCity")} maxLength={120} />
          </label>
          <label className="field">
            <span>UF</span>
            <input name="addressState" defaultValue={v("addressState")} maxLength={40} />
          </label>
          <label className="field">
            <span>CEP</span>
            <input name="addressPostalCode" defaultValue={v("addressPostalCode")} maxLength={20} inputMode="numeric" />
          </label>
          <label className="field">
            <span>País</span>
            <input name="addressCountry" defaultValue={v("addressCountry") || "Brasil"} maxLength={60} />
          </label>
        </div>

        <h2 className="section-title">Pedido</h2>
        <div className="grid-2">
          <label className="field">
            <span>Número do pedido (vazio = gerar)</span>
            <input name="orderNumber" defaultValue={v("orderNumber")} maxLength={60} placeholder="AQB-…" />
            {err("orderNumber")}
          </label>
          <label className="field">
            <span>ID no checkout (opcional)</span>
            <input name="externalId" defaultValue={v("externalId")} maxLength={120} />
          </label>
          <label className="field span-2">
            <span>Itens * (um por linha: “2x AquaBlast Azul | 129,90”)</span>
            <textarea name="items" defaultValue={v("items")} rows={4} required />
            {err("items")}
          </label>
          <label className="field">
            <span>Total (R$)</span>
            <input name="amountTotal" defaultValue={v("amountTotal")} inputMode="decimal" placeholder="129,90" maxLength={20} />
          </label>
          <label className="field">
            <span>Situação do pagamento *</span>
            <select name="paymentStatus" defaultValue={v("paymentStatus") || "pending"}>
              {PAYMENT_OPTIONS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            {err("paymentStatus")}
          </label>
          <label className="field">
            <span>Forma de pagamento</span>
            <input name="paymentMethod" defaultValue={v("paymentMethod")} maxLength={40} placeholder="pix, cartão, boleto…" />
          </label>
          <label className="field">
            <span>Link de pagamento</span>
            <input name="paymentUrl" defaultValue={v("paymentUrl")} maxLength={1000} />
          </label>
          <label className="field span-2">
            <span>Pix copia e cola (se pendente)</span>
            <textarea name="pixCode" defaultValue={v("pixCode")} rows={2} className="mono" />
          </label>
          <label className="field span-2">
            <span>Notas internas</span>
            <textarea name="adminNotes" rows={2} />
          </label>
        </div>
        <label className="check">
          <input type="checkbox" name="sendConfirmation" defaultChecked />
          <span>Se estiver pago e tiver e-mail, enviar a confirmação com código de acesso</span>
        </label>
        <div className="actions">
          <button type="submit" className="btn btn-primary" disabled={pending}>
            {pending ? "Criando…" : "Criar pedido"}
          </button>
        </div>
      </fieldset>
      {state ? <p className={`af-result ${state.ok ? "is-ok" : "is-err"}`}>{state.message}</p> : null}
    </form>
  );
}
