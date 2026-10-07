import { Check } from "lucide-react";
import styles from "./CheckoutProgress.module.css";

const steps = ["Seus dados", "Entrega", "Pagamento"];

export function CheckoutProgress({ step, busy, onEdit }: { step: number; busy: boolean; onEdit: (step: number) => void }) {
  return (
    <div className={`${styles.wrap} ck-progress-wrap`}>
      <div className="ck-checkout-intro">
        <h1>Finalize seu pedido</h1>
        <p>Etapa {step} de 3 · {steps[step - 1]}</p>
      </div>
      <nav className="ck-progress" aria-label="Progresso da compra">
        <ol>
          {steps.map((name, index) => {
            const number = index + 1;
            const done = number < step;
            return (
              <li key={name} className={done ? "is-done" : number === step ? "is-current" : "is-todo"}>
                <button type="button" disabled={!done || busy} onClick={() => onEdit(number)}
                  aria-current={number === step ? "step" : undefined} aria-label={done ? `Editar ${name.toLowerCase()}` : name}>
                  <span className={number === step ? styles.current : undefined} aria-hidden="true">{done ? <Check size={14} /> : number}</span>
                  <b>{name}</b>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
    </div>
  );
}
