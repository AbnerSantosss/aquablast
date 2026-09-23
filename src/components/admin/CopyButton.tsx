"use client";

import { useState } from "react";

export function CopyButton({ value, label = "Copiar", small }: { value: string; label?: string; small?: boolean }) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setState("ok");
    } catch {
      setState("err");
    }
    window.setTimeout(() => setState("idle"), 1800);
  }
  return (
    <button type="button" className={`btn ${small ? "btn-sm" : ""} btn-ghost`} onClick={copy} aria-live="polite">
      {state === "ok" ? "Copiado!" : state === "err" ? "Não foi possível copiar" : label}
    </button>
  );
}
