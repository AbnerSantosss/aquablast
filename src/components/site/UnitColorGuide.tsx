"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Check, X } from "lucide-react";
import { COLOR_KEYS, COLOR_LABELS } from "@/lib/site/constants";
import { PurchaseLink } from "./PurchaseLink";
import { useSelection } from "./SelectionProvider";
import styles from "./KitColorGuide.module.css";
import unitStyles from "./UnitColorGuide.module.css";

export type UnitColorGuideProps = {
  /** Increment only after the customer asks to choose a color. */
  openRequest: number;
  onSelectionChange: () => void;
};

export function UnitColorGuide({ openRequest, onSelectionChange }: UnitColorGuideProps) {
  const { color, colorTouched, chooseColor } = useSelection();
  const [needsChoice, setNeedsChoice] = useState(false);
  const choicesRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const restoreOverflowRef = useRef<string | null>(null);
  const handledRequest = useRef(0);
  const focusFrame = useRef<number | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  const restoreAfterClose = useCallback(() => {
    // A queued close event must not unlock a dialog that has since reopened.
    if (dialogRef.current?.open) return;
    setNeedsChoice(false);
    if (focusFrame.current !== null) cancelAnimationFrame(focusFrame.current);
    focusFrame.current = null;
    if (restoreOverflowRef.current !== null) {
      document.documentElement.style.overflow = restoreOverflowRef.current;
      restoreOverflowRef.current = null;
    }
    if (returnFocusRef.current?.isConnected) {
      returnFocusRef.current.focus({ preventScroll: true });
    }
    returnFocusRef.current = null;
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => {
      dialog?.close();
      restoreAfterClose();
      handledRequest.current = 0;
    };
  }, [restoreAfterClose]);

  useEffect(() => {
    if (openRequest <= 0 || handledRequest.current === openRequest) return;
    handledRequest.current = openRequest;
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    restoreOverflowRef.current = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    dialog.showModal();
    focusFrame.current = requestAnimationFrame(() => {
      titleRef.current?.focus({ preventScroll: true });
      focusFrame.current = null;
    });
  }, [openRequest]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onClose={restoreAfterClose}
      data-unit-guide
    >
      <div className={styles.dialogHeader}>
        <span className={styles.eyebrow}>SEU AQUABLAST, DO SEU JEITO</span>
        <button type="button" className={styles.close} aria-label="Fechar escolha de cor" onClick={() => dialogRef.current?.close()}>
          <X size={21} aria-hidden="true" />
        </button>
      </div>

      <h2 ref={titleRef} id={titleId} className={styles.title} tabIndex={-1}>Escolha a cor do seu AquaBlast</h2>
      <p id={descriptionId} className={styles.description}>Toque na cor que você quer e continue para o pagamento.</p>

      {needsChoice && <p className={styles.choiceAlert} id={`${descriptionId}-error`} role="alert">Nenhuma cor escolhida: seguimos com {COLOR_LABELS[color]}. Toque de novo para continuar ou escolha outra cor.<ArrowDown size={18} aria-hidden="true" /></p>}
      <div ref={choicesRef} tabIndex={-1} className={styles.choices} data-attention={needsChoice || undefined} role="group" aria-describedby={needsChoice ? `${descriptionId}-error` : undefined} aria-label="Cor do seu AquaBlast">
        {COLOR_KEYS.map((option) => (
          <button
            key={option}
            type="button"
            // Depois do aviso "seguimos com Azul", o cartao da cor padrao aparece marcado para bater com o texto.
            aria-pressed={(colorTouched || needsChoice) && color === option}
            onClick={() => {
              chooseColor(option);
              setNeedsChoice(false);
              onSelectionChange();
            }}
          >
            <span className={styles.selectedCheck} aria-hidden="true"><Check size={13} /></span>
            <Image src={`/thumbs/produto-${option}-110.webp`} alt="" width={92} height={92} unoptimized />
            <strong>{COLOR_LABELS[option]}</strong>
          </button>
        ))}
      </div>

      <div className={styles.footer}>
        {/* Sem cor escolhida o primeiro toque so avisa (cor padrao); o segundo segue para o checkout. O botao nunca trava (pedido do dono, 2026-10-10). */}
        {colorTouched || needsChoice ? (
          <PurchaseLink pack="unit" direct className={`${styles.next} ${unitStyles.continue}`}>
            Continuar para pagamento <ArrowRight size={18} aria-hidden="true" />
          </PurchaseLink>
        ) : (
          <button type="button" className={styles.next} data-awaiting onClick={() => {
            setNeedsChoice(true);
            requestAnimationFrame(() => {
              choicesRef.current?.focus({ preventScroll: true });
              choicesRef.current?.scrollIntoView({ block: "nearest" });
            });
          }}>
            Continuar para pagamento <ArrowRight size={18} aria-hidden="true" />
          </button>
        )}
      </div>
    </dialog>
  );
}
