"use client";

import { useEffect, useRef, useState, type ChangeEvent, type CSSProperties } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Monitor, Save, Smartphone, Trash2, Upload } from "lucide-react";
import {
  BANNER_ALT_MAX,
  BANNER_DEVICE_LABELS,
  BANNER_DEVICES,
  BANNER_PRODUCTS,
  BANNER_RECOMMENDED,
  bannerDefaultAlt,
  bannerProductLabel,
  bannerRatioIsOff,
  type AdminBannerArt,
  type AdminBannerMap,
  type BannerDevice,
  type BannerProduct,
} from "@/lib/checkout/own/banners";
import { BANNER_IMAGE_MAX_BYTES, BANNER_IMAGE_MAX_LABEL, bannerTooBigMessage } from "@/lib/checkout/own/banners-image";
import { formatBytes } from "@/lib/checkout/own/reviews-image";

type Status = { kind: "idle" } | { kind: "busy"; text: string } | { kind: "ok"; text: string } | { kind: "err"; text: string };

const MIME_LABELS: Record<string, string> = { "image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WebP" };
/** O que o checkout mostra no espaço que está sem arte. A arte de "celular e tablet" vale até 1099 px de largura. */
const EMPTY_NOTE: Record<BannerDevice, string> = {
  desktop: "No computador o checkout mostra o banner de texto.",
  mobile: "No celular o checkout não mostra banner. No tablet, mostra o banner de texto.",
};
/** O que passa a valer depois de remover a arte: entra na pergunta de confirmação. */
const AFTER_REMOVE: Record<BannerDevice, string> = {
  desktop: "No computador o checkout volta a mostrar o banner de texto.",
  mobile: "No celular o checkout fica sem banner. No tablet, volta a mostrar o banner de texto.",
};
const NETWORK = "Confira a internet e tente de novo.";

async function errorOf(response: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body && typeof body.error === "string") return body.error;
  } catch {
    // Resposta sem JSON (queda de rede, proxy): cai na mensagem padrão.
  }
  return fallback;
}

/** Descrição como o servidor gravou (sem espaço sobrando). Sem ela na resposta, vale o que estava no campo. */
async function savedAltOf(response: Response, typed: string): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "customAlt" in body && typeof body.customAlt === "string") return body.customAlt;
  } catch {
    // Resposta sem JSON: a gravação deu certo (status 2xx), só não veio o texto de volta.
  }
  return typed.trim();
}

/**
 * Um espaço de banner (um produto em um dispositivo): mostra a arte, envia, troca, remove e grava a
 * descrição da imagem. O arquivo vai como o dono exportou, sem redução no navegador: é arte pronta, com
 * texto, e redesenhar em <canvas> borraria as letras e apagaria a transparência.
 */
function BannerSlot({ product, device, art }: { product: BannerProduct; device: BannerDevice; art: AdminBannerArt | undefined }) {
  const router = useRouter();
  const slotRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const altRef = useRef<HTMLInputElement>(null);
  /** Para onde o foco volta quando a operação termina: o botão usado fica desabilitado enquanto ela roda e perde o foco. */
  const focusAfter = useRef<"pick" | "remove" | "alt" | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [alt, setAlt] = useState(art?.customAlt ?? "");
  const busy = status.kind === "busy";

  useEffect(() => {
    if (busy || !focusAfter.current) return;
    const target = { pick: pickRef, remove: removeRef, alt: altRef }[focusAfter.current].current;
    focusAfter.current = null;
    const active = document.activeElement;
    // Quem já levou o foco para outro lugar da tela enquanto a operação rodava fica onde está.
    if (target && (!active || active === document.body || slotRef.current?.contains(active))) target.focus();
  }, [busy]);

  const productLabel = bannerProductLabel(product);
  const deviceLabel = BANNER_DEVICE_LABELS[device];
  /** "Unidade azul, computador": entra no rótulo de cada botão para o leitor de tela saber de qual espaço é. */
  const where = `${productLabel}, ${deviceLabel.toLowerCase()}`;
  const recommended = BANNER_RECOMMENDED[device];
  const endpoint = `/api/admin/checkout-banners/${product}/${device}`;
  const defaultAlt = bannerDefaultAlt(product);
  const altDirty = Boolean(art) && alt.trim() !== (art?.customAlt ?? "");
  const DeviceIcon = device === "desktop" ? Monitor : Smartphone;
  const ratio = { "--cb-ratio": `${recommended.width} / ${recommended.height}` } as CSSProperties;

  const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Limpa o campo para o mesmo arquivo poder ser escolhido de novo depois de um erro.
    event.target.value = "";
    if (!file) return;
    if (file.size > BANNER_IMAGE_MAX_BYTES) {
      setStatus({ kind: "err", text: bannerTooBigMessage(file.size) });
      return;
    }
    const replacing = Boolean(art);
    const failed = `Não deu para enviar a arte. ${NETWORK}`;
    focusAfter.current = "pick";
    setStatus({ kind: "busy", text: "Enviando a arte..." });
    try {
      const body = new FormData();
      body.append("file", file, file.name);
      // Na troca a descrição vai junto, para não perder o que estiver digitado e ainda não gravado.
      if (replacing) body.append("alt", alt);
      const response = await fetch(endpoint, { method: "POST", body });
      if (!response.ok) {
        setStatus({ kind: "err", text: await errorOf(response, failed) });
        return;
      }
      if (replacing) setAlt(await savedAltOf(response, alt));
      setStatus({ kind: "ok", text: replacing ? "Arte trocada." : "Arte enviada." });
      router.refresh();
    } catch {
      setStatus({ kind: "err", text: failed });
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remover a arte de ${productLabel} (${deviceLabel.toLowerCase()})? ${AFTER_REMOVE[device]}`)) return;
    const failed = `Não deu para remover a arte. ${NETWORK}`;
    focusAfter.current = "remove";
    setStatus({ kind: "busy", text: "Removendo a arte..." });
    try {
      const response = await fetch(endpoint, { method: "DELETE" });
      if (!response.ok) {
        setStatus({ kind: "err", text: await errorOf(response, failed) });
        return;
      }
      setAlt("");
      // O botão "Remover" some junto com a arte: o foco vai para o botão de enviar, não se perde.
      focusAfter.current = "pick";
      setStatus({ kind: "ok", text: "Arte removida." });
      router.refresh();
    } catch {
      setStatus({ kind: "err", text: failed });
    }
  };

  const saveAlt = async () => {
    const failed = `Não deu para gravar a descrição. ${NETWORK}`;
    // Depois de gravar, o botão "Salvar descrição" fica desabilitado (nada a salvar): o foco volta para o campo.
    focusAfter.current = "alt";
    setStatus({ kind: "busy", text: "Gravando a descrição..." });
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ alt }) });
      if (!response.ok) {
        setStatus({ kind: "err", text: await errorOf(response, failed) });
        return;
      }
      setAlt(await savedAltOf(response, alt));
      setStatus({ kind: "ok", text: "Descrição gravada." });
      router.refresh();
    } catch {
      setStatus({ kind: "err", text: failed });
    }
  };

  return (
    <div ref={slotRef} className="cb-slot" role="group" aria-label={where} aria-busy={busy} data-product={product} data-device={device} data-filled={art ? "true" : "false"}>
      <p className="cb-device">
        <DeviceIcon size={15} aria-hidden="true" /> {deviceLabel}
      </p>

      {art ? (
        <>
          <a className="cb-thumb" style={ratio} href={art.url} target="_blank" rel="noreferrer" aria-label={`Abrir a arte em tamanho real: ${where}`}>
            <Image src={art.url} alt={art.alt} width={art.width} height={art.height} unoptimized />
          </a>
          <p className="small cb-meta">
            {art.width} x {art.height} px, {formatBytes(art.sizeBytes)}, {MIME_LABELS[art.mime] ?? art.mime}
          </p>
          {bannerRatioIsOff(device, art.width, art.height) ? (
            <p className="callout warn cb-warn">
              A proporção desta arte ({art.width} x {art.height} px) foge da recomendada ({recommended.width} x {recommended.height} px). Abra o checkout no {deviceLabel.toLowerCase()} e confira como
              ficou.
            </p>
          ) : null}
        </>
      ) : (
        <>
          <div className="cb-thumb cb-empty" style={ratio}>
            <span>Sem arte</span>
          </div>
          <p className="small muted cb-meta">{EMPTY_NOTE[device]}</p>
        </>
      )}

      <input ref={inputRef} className="cb-file" type="file" accept="image/jpeg,image/png,image/webp" onChange={onPick} tabIndex={-1} aria-hidden="true" data-cb-file={`${product}:${device}`} />
      <div className="actions tight">
        <button ref={pickRef} type="button" className="btn btn-ghost btn-sm" onClick={() => inputRef.current?.click()} disabled={busy} aria-label={`${art ? "Trocar" : "Enviar arquivo"}: ${where}`}>
          <Upload size={14} aria-hidden="true" /> {art ? "Trocar" : "Enviar arquivo"}
        </button>
        {art ? (
          <button ref={removeRef} type="button" className="btn btn-ghost btn-sm danger" onClick={remove} disabled={busy} aria-label={`Remover: ${where}`}>
            <Trash2 size={14} aria-hidden="true" /> Remover
          </button>
        ) : null}
      </div>
      <p className="hint cb-hint">
        Recomendado: {recommended.width} x {recommended.height} px. JPEG, PNG ou WebP, até {BANNER_IMAGE_MAX_LABEL}.
      </p>

      {art ? (
        <div className="cb-alt">
          <label className="field">
            <span>Descrição da imagem (opcional)</span>
            <input
              ref={altRef}
              value={alt}
              onChange={(event) => setAlt(event.target.value)}
              // Sem <form> em volta (de propósito): Enter no campo grava a descrição, como o botão.
              onKeyDown={(event) => {
                if (event.key === "Enter" && altDirty && !busy) void saveAlt();
              }}
              maxLength={BANNER_ALT_MAX}
              placeholder={defaultAlt}
              disabled={busy}
              aria-label={`Descrição da imagem (opcional): ${where}`}
            />
            <span className="hint">
              Texto lido por leitor de tela, até {BANNER_ALT_MAX} caracteres. Vazio, vale &quot;{defaultAlt}&quot;.
            </span>
          </label>
          <button type="button" className="btn btn-ghost btn-sm" onClick={saveAlt} disabled={busy || !altDirty} aria-label={`Salvar descrição: ${where}`}>
            <Save size={14} aria-hidden="true" /> Salvar descrição
          </button>
        </div>
      ) : null}

      <div className="cb-status" role="status">
        {status.kind !== "idle" ? (
          <div className={`af-result ${status.kind === "err" ? "is-err" : "is-ok"}`}>
            <span>{status.text}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** Bloco "Banner por produto" de /admin/checkout: uma linha por produto, um espaço por dispositivo. */
export function CheckoutBanners({ banners }: { banners: AdminBannerMap }) {
  return (
    <div className="cb-list">
      {BANNER_PRODUCTS.map((product) => (
        <section key={product} className="cb-product" aria-labelledby={`cb-${product}`}>
          <h3 id={`cb-${product}`} className="cb-product-name">
            {bannerProductLabel(product)}
          </h3>
          <div className="cb-slots">
            {BANNER_DEVICES.map((device) => (
              <BannerSlot key={device} product={product} device={device} art={banners[product]?.[device]} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
