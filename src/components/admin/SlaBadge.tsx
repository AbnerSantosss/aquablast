import { formatDateTime } from "@/lib/admin/format";
import { slaLabel, slaState, slaTone } from "@/lib/orders/sla";

/** Selo do prazo de postagem: verde no prazo, laranja vence em até 24 h, vermelho atrasado. */
export function SlaBadge({ paidAt, slaDays, now }: { paidAt: Date; slaDays: number; now?: Date }) {
  const s = slaState(paidAt, slaDays, now);
  return (
    <span className={`badge tone-${slaTone(s)}`} title={`Postar até ${formatDateTime(s.dueAt)}`} data-sla={s.state}>
      {slaLabel(s)}
    </span>
  );
}
