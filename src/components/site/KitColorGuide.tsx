"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, Check, ChevronRight, X } from "lucide-react";
import { COLOR_KEYS, COLOR_LABELS } from "@/lib/site/constants";
import { useSelection } from "./SelectionProvider";
import styles from "./KitColorGuide.module.css";

type UnitIndex = 0 | 1;
type GuideStep = UnitIndex | 2;

export type KitColorGuideProps = {
  /** Increment to open the first unconfirmed unit, or the completed kit summary. */
  openRequest: number;
  onSelectionChange: () => void;
  showSummary?: boolean;
  confirmFocusSelector?: string;
};

const UNITS = [0, 1] as const;

export function KitColorGuide({ openRequest, onSelectionChange, showSummary = true, confirmFocusSelector = "#inicio .summer-buy-button" }: KitColorGuideProps) {
  const { kitColors, kitConfirmed, selectKitColor } = useSelection();
  const [chosenStep, setChosenStep] = useState<GuideStep | null>(null);
  const [needsChoice, setNeedsChoice] = useState(false);
  const choicesRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const restoreOverflowRef = useRef<string | null>(null);
  const confirmFocusRef = useRef(false);
  const handledRequest = useRef(0);
  const titleId = useId();
  const descriptionId = useId();
  const missing: GuideStep = !kitConfirmed[0] ? 0 : !kitConfirmed[1] ? 1 : 2;
  const step = chosenStep ?? missing;
  const ready = kitConfirmed.every(Boolean);

  function showDialog() {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    restoreOverflowRef.current = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    confirmFocusRef.current = false;
    dialog.showModal();
    requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
  }

  useEffect(() => {
    if (openRequest <= 0 || handledRequest.current === openRequest) return;
    handledRequest.current = openRequest;
    showDialog();
  }, [openRequest]);

  useEffect(() => () => {
    if (restoreOverflowRef.current !== null) {
      document.documentElement.style.overflow = restoreOverflowRef.current;
    }
  }, []);

  function openUnit(index: UnitIndex) {
    setChosenStep(index === 1 && !kitConfirmed[0] ? 0 : index);
    showDialog();
  }

  function moveTo(next: GuideStep) {
    setNeedsChoice(false);
    setChosenStep(next);
    requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
  }

  function requestChoice() {
    setNeedsChoice(true);
    requestAnimationFrame(() => {
      choicesRef.current?.focus({ preventScroll: true });
      choicesRef.current?.scrollIntoView({ block: "nearest" });
    });
  }

  function restoreAfterClose() {
    if (restoreOverflowRef.current !== null) {
      document.documentElement.style.overflow = restoreOverflowRef.current;
      restoreOverflowRef.current = null;
    }
    const target = confirmFocusRef.current
      ? document.querySelector<HTMLElement>(confirmFocusSelector)
      : returnFocusRef.current;
    setChosenStep(null);
    setNeedsChoice(false);
    requestAnimationFrame(() => target?.focus({ preventScroll: true }));
  }

  return (
    <div className={showSummary ? styles.guide : undefined} data-kit-guide data-kit-ready={ready || undefined}>
      {showSummary && <>
      <p className={styles.hint} aria-live="polite">
        {ready ? "Cores do seu kit" : "Escolha a cor de cada AquaBlast"}
        {ready && <span><Check size={13} aria-hidden="true" /> Kit pronto</span>}
      </p>
      <p id={`${descriptionId}-hint`} className={styles.bubble} data-step={missing} role="status">
        {ready ? "Cores prontas. Continue em Quero o kit com 2." : missing === 0 ? "Escolha a cor da primeira unidade abaixo." : "Agora escolha a cor da segunda unidade."}
      </p>
      <div className={styles.summary}>
        {UNITS.map((index) => (
          <button
            key={index}
            type="button"
            className={styles.unit}
            data-current={missing === index || undefined}
            data-confirmed={kitConfirmed[index] || undefined}
            disabled={index === 1 && !kitConfirmed[0]}
            aria-describedby={`${descriptionId}-hint`}
            aria-haspopup="dialog"
            aria-label={`${kitConfirmed[index] ? "Editar" : "Escolher"} cor da ${index + 1}ª unidade${kitConfirmed[index] ? `: ${COLOR_LABELS[kitColors[index]]}` : ""}`}
            onClick={() => openUnit(index)}
          >
            <Image src={`/thumbs/produto-${kitColors[index]}-110.webp`} alt="" width={42} height={42} unoptimized />
            <span className={styles.unitCopy}>
              <small>{index + 1}ª unidade</small>
              <strong>{kitConfirmed[index] ? COLOR_LABELS[kitColors[index]] : index === 1 && !kitConfirmed[0] ? "Aguarde a 1ª" : "Escolha a cor"}</strong>
            </span>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ))}
      </div>

      </>}
      <dialog
        ref={dialogRef}
        className={styles.dialog}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onClose={restoreAfterClose}
      >
        <div className={styles.dialogHeader}>
          <span className={styles.eyebrow}>SEU KIT, DO SEU JEITO</span>
          <button type="button" className={styles.close} aria-label="Fechar escolha de cores" onClick={() => dialogRef.current?.close()}>
            <X size={21} aria-hidden="true" />
          </button>
        </div>
        <nav className={styles.steps} aria-label="Etapas da escolha de cores">
          {UNITS.map((index) => (
            <button
              key={index}
              type="button"
              aria-current={step === index ? "step" : undefined}
              aria-disabled={index === 1 && !kitConfirmed[0]}
              onClick={() => index === 1 && !kitConfirmed[0] ? requestChoice() : moveTo(index)}
            >
              <span>{kitConfirmed[index] ? <Check size={15} aria-hidden="true" /> : index + 1}</span>
              {step === index && !kitConfirmed[index] ? `Escolha a ${index + 1}ª unidade` : `${index + 1}ª unidade`}
            </button>
          ))}
        </nav>

        <h2 ref={titleRef} id={titleId} className={styles.title} tabIndex={-1}>
          {step === 2 ? "Confira as cores do seu kit" : `Escolha a cor da ${step + 1}ª unidade`}
        </h2>
        <p id={descriptionId} className={styles.description}>
          {step === 2 ? "Tudo certo? Confirme para continuar sua compra." : step === 0 ? "Toque na cor que você quer para o primeiro AquaBlast." : "Agora escolha o segundo. As duas unidades podem ter a mesma cor."}
        </p>
        {needsChoice && <p className={styles.choiceAlert} id={`${descriptionId}-error`} role="alert">Escolha uma cor para a {step === 0 ? "primeira" : "segunda"} unidade aqui.<ArrowDown size={18} aria-hidden="true" /></p>}

        {step === 2 ? (
          <div className={styles.review}>
            {UNITS.map((index) => (
              <div key={index} className={styles.reviewUnit}>
                <Image src={`/thumbs/produto-${kitColors[index]}-110.webp`} alt={`AquaBlast ${COLOR_LABELS[kitColors[index]]}`} width={88} height={88} unoptimized />
                <span><small>{index + 1}ª unidade</small><strong>{COLOR_LABELS[kitColors[index]]}</strong></span>
                <button type="button" onClick={() => moveTo(index)} aria-label={`Editar cor da ${index + 1}ª unidade`}>Editar</button>
              </div>
            ))}
          </div>
        ) : (
          <div ref={choicesRef} tabIndex={-1} className={styles.choices} data-attention={needsChoice || undefined} role="group" aria-describedby={needsChoice ? `${descriptionId}-error` : undefined} aria-label={`Cor da ${step + 1}ª unidade`}>
            {COLOR_KEYS.map((color) => (
              <button
                key={color}
                type="button"
                aria-pressed={kitConfirmed[step] && kitColors[step] === color}
                onClick={() => {
                  setChosenStep(step);
                  setNeedsChoice(false);
                  selectKitColor(step, color);
                  onSelectionChange();
                }}
              >
                <span className={styles.selectedCheck} aria-hidden="true"><Check size={13} /></span>
                <Image src={`/thumbs/produto-${color}-110.webp`} alt="" width={92} height={92} unoptimized />
                <strong>{COLOR_LABELS[color]}</strong>
              </button>
            ))}
          </div>
        )}

        <div className={styles.footer}>
          {step > 0 && <button type="button" className={styles.back} onClick={() => moveTo(step === 2 ? 1 : 0)}><ArrowLeft size={17} aria-hidden="true" /> Voltar</button>}
          {step === 2 ? (
            <button type="button" className={styles.next} disabled={!ready} onClick={() => { confirmFocusRef.current = true; dialogRef.current?.close(); }}>
              Confirmar cores <Check size={18} aria-hidden="true" />
            </button>
          ) : (
            <button type="button" className={styles.next} data-awaiting={!kitConfirmed[step] || undefined} onClick={() => kitConfirmed[step] ? moveTo(step === 0 ? 1 : 2) : requestChoice()}>
              {step === 0 ? "Escolher a 2ª unidade" : "Revisar meu kit"}<ArrowRight size={18} aria-hidden="true" />
            </button>
          )}
        </div>
      </dialog>
    </div>
  );
}
