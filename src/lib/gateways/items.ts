import type { ChargeInput, ChargeItem, GatewayContext } from "./types";

/** Empresa padrão (AquaBlast). Igual a DEFAULT_COMPANY_ID de db/schema.ts. */
export const DEFAULT_GATEWAY_COMPANY = "00000000-0000-4000-8000-000000000001";

/** companyId do contexto, com fallback na empresa padrão. */
export const companyOf = (ctx?: GatewayContext | null): string => ctx?.companyId || DEFAULT_GATEWAY_COMPANY;

/** Item único do modo legado: o mesmo payload que os gateways mandavam antes do multiempresa. */
export function legacyChargeItems(title: string, sku: string, amountCents: number): ChargeItem[] {
  return [{ title, sku, quantity: 1, unitCents: amountCents }];
}

/**
 * Linhas que o gateway recebe. Se os itens (+ frete) fecham exatamente com amountCents, vão os itens e o frete
 * como linha própria ("Frete"). Se não fecham (cupom, desconto, Pix de teste) ou a lista é inválida, vai um item
 * consolidado com o total, igual ao comportamento de antes: o gateway nunca cobra valor diferente de amountCents.
 */
export function itemsForGateway(input: Pick<ChargeInput, "items" | "shippingCents" | "amountCents" | "title" | "sku">): ChargeItem[] {
  const items = Array.isArray(input.items) ? input.items : [];
  const valid =
    items.length > 0 &&
    items.every((i) => Number.isInteger(i.quantity) && i.quantity > 0 && Number.isInteger(i.unitCents) && i.unitCents >= 0 && !!i.title);
  const shipping = Number.isInteger(input.shippingCents) && (input.shippingCents ?? 0) > 0 ? (input.shippingCents as number) : 0;
  if (valid) {
    const sum = items.reduce((acc, i) => acc + i.unitCents * i.quantity, 0) + shipping;
    if (sum === input.amountCents) {
      return shipping > 0 ? [...items, { title: "Frete", sku: "FRETE", quantity: 1, unitCents: shipping }] : items;
    }
  }
  return legacyChargeItems(input.title, input.sku, input.amountCents);
}
