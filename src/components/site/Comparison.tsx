import { Check, X } from "lucide-react";
import styles from "./Comparison.module.css";

const features = [
  { label: "Dispara sem bombear", manual: "Não" },
  { label: "Disparos em sequência ao apertar", manual: "Não" },
  { label: "Sem cansar o braço da criança", manual: "Não" },
  { label: "Luz LED", manual: "Não" },
  { label: "Visor incluso", manual: "Não" },
];

export function Comparison() {
  return (
    <section id="comparativo" className={styles.section} aria-labelledby="comparison-title">
      <div className={styles.container}>
        <h2 id="comparison-title">Por que o elétrico muda a brincadeira?</h2>
        <p className={styles.lead}><strong>Você conhece a cena.</strong> O brinquedo de água chega, a criança bombeia, o braço cansa e logo ele fica esquecido no canto do quintal. O AquaBlast é elétrico: aperta e dispara, sem parar para bombear.</p>
        <div className={styles.tableFrame}>
          <table className={styles.table}>
            <caption className="visually-hidden">AquaBlast x brinquedo de bombear</caption>
            <colgroup>
              <col className={styles.featureColumn} />
              <col className={styles.productColumn} />
              <col className={styles.manualColumn} />
            </colgroup>
            <thead>
              <tr>
                <th scope="col"><span className="visually-hidden">Característica</span></th>
                <th scope="col" className={styles.product}>AquaBlast</th>
                <th scope="col">Brinquedo<br />de bombear</th>
              </tr>
            </thead>
            <tbody>
              {features.map((feature) => (
                <tr key={feature.label}>
                  <th scope="row">{feature.label}</th>
                  <td className={styles.product}>
                    <span className={styles.answer}>
                      <Check size={20} strokeWidth={2.5} aria-hidden="true" />
                      <span>Sim</span>
                    </span>
                  </td>
                  <td>
                    <span className={styles.answer}>
                      {feature.manual === "Não" ? <X size={18} aria-hidden="true" /> : null}
                      <span>{feature.manual}</span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
