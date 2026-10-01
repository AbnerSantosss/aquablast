"use client";

import { useState } from "react";
import { Check, ClipboardCopy, Copy } from "lucide-react";
import { revealOrderDocument } from "@/lib/admin/actions/orders";
import { CPF_TOKEN } from "@/lib/admin/format";

type CopyState = "idle" | "ok" | "err";

/**
 * Copia um texto que pode depender de uma chamada ao servidor. O ClipboardItem com Promise mantém o gesto do clique
 * no Safari; onde não existir, cai no writeText depois do await (Chrome/Edge aceitam).
 */
async function copyText(get: () => Promise<string>): Promise<void> {
  if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
    const blob = get().then((t) => new Blob([t], { type: "text/plain" }));
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    return;
  }
  await navigator.clipboard.writeText(await get());
}

function useCopy() {
  const [state, setState] = useState<CopyState>("idle");
  async function run(get: () => Promise<string>) {
    try {
      await copyText(get);
      setState("ok");
    } catch {
      setState("err");
    }
    window.setTimeout(() => setState("idle"), 1800);
  }
  return { state, run };
}

async function withCpf(text: string, orderId: string | undefined): Promise<string> {
  if (!orderId || !text.includes(CPF_TOKEN)) return text;
  const cpf = await revealOrderDocument(orderId);
  if (!cpf) throw new Error("sem CPF");
  return text.replaceAll(CPF_TOKEN, cpf);
}

/** Ícone de copiar no fim de cada campo. Com `cpfOf`, copia o CPF completo do pedido em vez de `value`. */
export function CopyField({ label, value, cpfOf }: { label: string; value?: string; cpfOf?: string }) {
  const { state, run } = useCopy();
  const title = state === "ok" ? `${label} copiado` : state === "err" ? "Não foi possível copiar" : `Copiar ${label.toLowerCase()}`;
  return (
    <button
      type="button"
      className={`copy-icon${state === "ok" ? " is-ok" : state === "err" ? " is-err" : ""}`}
      onClick={() => run(() => (cpfOf ? withCpf(CPF_TOKEN, cpfOf) : Promise.resolve(value ?? "")))}
      title={title}
      aria-label={title}
    >
      {state === "ok" ? <Check aria-hidden size={16} /> : <Copy aria-hidden size={16} />}
    </button>
  );
}

/** "Copiar tudo": bloco pronto para colar no pedido do fornecedor. `text` pode ter {@link CPF_TOKEN}. */
export function CopyAllButton({ text, orderId }: { text: string; orderId: string }) {
  const { state, run } = useCopy();
  return (
    <button type="button" className="btn btn-sm btn-blue" onClick={() => run(() => withCpf(text, orderId))} aria-live="polite">
      {state === "ok" ? <Check aria-hidden size={16} /> : <ClipboardCopy aria-hidden size={16} />}
      {state === "ok" ? "Copiado!" : state === "err" ? "Não foi possível copiar" : "Copiar tudo"}
    </button>
  );
}
