"use client";

import Link from "next/link";
import { Clock, Droplets } from "lucide-react";
import { timeLeft, type Theme } from "@/lib/checkout/own/theme";
import { pad2, useClock } from "./useClock";

/** Logo do checkout (origem app/checkout.tsx, `Brand()`): link para a home com o ícone Droplets. */
export function Brand({ storeName }: { storeName: string }) {
  return (
    <Link className="brand" href="/" aria-label={`${storeName} início`}>
      <Droplets aria-hidden="true" />
      <span>{storeName}</span>
    </Link>
  );
}

/**
 * Divide o rótulo do tema no formato da origem: `Oferta<span.ck-timer-long> Dia das Crianças</span> termina em:`
 * (o miolo some no celular por CSS). Rótulo fora desse formato vai inteiro, sem parte escondida.
 */
function splitLabel(label: string): [string, string, string] {
  const m = /^(Oferta)( .+?)( termina em:?)$/.exec(label);
  return m ? [m[1], m[2], m[3]] : [label, "", ""];
}

/**
 * Cronômetro da oferta (origem `OfferTimer`). Data e rótulo vêm do tema (painel /admin/checkout). Só mostra o
 * tempo depois de montar no cliente (`is-pending` + aria-hidden antes disso) e some quando a data passa —
 * nenhum número inventado no lugar.
 */
export function OfferTimer({ theme }: { theme: Theme }) {
  const now = useClock(theme.timerEnabled);
  if (!theme.timerEnabled) return null;
  const left = now === null ? null : timeLeft(theme.timerEnd, now);
  if (now !== null && !left) return null;
  const [head, long, tail] = splitLabel(theme.timerLabel);
  return (
    <div className={`ck-timer${left ? "" : " is-pending"}`} aria-live="off" aria-hidden={left ? undefined : true}>
      <Clock size={16} aria-hidden="true" />
      <span>
        {head}
        {long ? <span className="ck-timer-long">{long}</span> : null}
        {tail}
      </span>
      <b>{left ? `${pad2(left.days)}d ${pad2(left.hours)}:${pad2(left.minutes)}:${pad2(left.seconds)}` : "00d 00:00:00"}</b>
    </div>
  );
}

/** Topo do checkout: marca + cronômetro (`header.ck-top`, origem app/checkout.tsx). */
export function TopBar({ theme }: { theme: Theme }) {
  return (
    <header className="ck-top">
      <Brand storeName={theme.storeName} />
      <OfferTimer theme={theme} />
    </header>
  );
}
