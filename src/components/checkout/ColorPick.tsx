import Image from "next/image";
import type { Selection } from "@/lib/checkout/own/catalog";
import { COLOR_KEYS, COLOR_LABELS } from "@/lib/site/constants";
import type { Color } from "@/lib/site/types";
import { thumbOf } from "./OrderSummary";

/**
 * Troca de cor no checkout (pedido do dono, 04/10): quem compra pelo botão do topo do celular chega com a cor
 * padrão (azul / azul + preto) e troca aqui, antes de preencher. Já vem marcada, então nunca trava a compra.
 * Só aparece nas etapas 1 e 2: na etapa 3 o Pix/pedido pode já ter sido gerado com as cores gravadas.
 */
export function ColorPick({ selection, onChange }: { selection: Selection; onChange: (index: 0 | 1, color: Color) => void }) {
  const isKit = selection.pack === "kit";
  const rows: { index: 0 | 1; title: string; value: Color }[] = isKit
    ? [
        { index: 0, title: "Cor do 1º AquaBlast", value: selection.colors[0] },
        { index: 1, title: "Cor do 2º AquaBlast", value: selection.colors[1] ?? selection.colors[0] },
      ]
    : [{ index: 0, title: "Cor do seu AquaBlast", value: selection.colors[0] }];
  return (
    <section className="ck-card ck-color-pick" aria-label="Escolha da cor">
      {rows.map((row) => (
        <div key={row.index} className="ck-color-row">
          <p className="ck-color-title" id={`ck-color-title-${row.index}`}>
            {row.title}
          </p>
          <div className="bump-color-options" role="radiogroup" aria-labelledby={`ck-color-title-${row.index}`}>
            {COLOR_KEYS.map((c) => (
              <label key={c} className={`bump-color${row.value === c ? " is-selected" : ""}`}>
                <input type="radio" name={`ck-color-${row.index}`} value={c} checked={row.value === c} onChange={() => onChange(row.index, c)} />
                <Image src={thumbOf(c)} width={36} height={36} alt="" />
                <span>{COLOR_LABELS[c]}</span>
              </label>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
