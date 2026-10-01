"use client";

import type { RecentSale } from "@/lib/push/sales";

/**
 * Peças do app do painel que rodam no navegador (PWA /admin). Um módulo só para o AdminPwa (layout) e a
 * tela /admin/app dividirem o mesmo estado: vendas já anunciadas, áudio desbloqueado e o prompt de instalação.
 * Ver wiki/operacao/aquablast-app-vendas-pwa.md.
 */

/**
 * Som de caixa registradora escolhido pelo dono (2026-10-01: um "ka-ching" de 1,1 s recortado do arquivo dele;
 * antes era o sintetizado de scripts/gen-som-venda.mjs). Só toca em venda, com o painel aberto.
 * Trocou o arquivo? Mude o `?v=`: o .mp3 passa pela Cloudflare e o navegador pode guardar o antigo.
 */
export const SALE_SOUND_URL = "/admin-app/venda.mp3?v=2";
export const SW_URL = "/admin-sw.js";
/** Escopo do SW = escopo do manifest. "/admin" (sem barra) para incluir a própria /admin, que é o start_url. */
export const SW_SCOPE = "/admin";
/** Intervalo do polling de vendas com o painel aberto (briefing: 20 s). */
export const SALES_POLL_MS = 20_000;

export const SALE_EVENT = "aqb:sale";
export const INSTALL_EVENT = "aqb:installable";

export interface SaleAnnouncement {
  /** id do pedido (dedupe entre o push e o polling); ausente no teste. */
  id?: string | null;
  title: string;
  body: string;
  url: string;
  /** Toca a caixa registradora? (venda e teste) */
  sound: boolean;
  /** Presente quando veio do polling: a tela /admin/app põe no topo da lista. */
  sale?: RecentSale;
}

const seen = new Set<string>();

export function markSeen(id: string): void {
  seen.add(id);
}

/** Anuncia uma venda/aviso para a janela (toast + som no AdminPwa). Devolve false se o pedido já foi anunciado. */
export function announce(a: SaleAnnouncement): boolean {
  if (a.id) {
    if (seen.has(a.id)) return false;
    seen.add(a.id);
  }
  window.dispatchEvent(new CustomEvent<SaleAnnouncement>(SALE_EVENT, { detail: a }));
  return true;
}

export function formatCents(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function saleToAnnouncement(s: RecentSale): SaleAnnouncement {
  return {
    id: s.id,
    title: `💰 Venda! ${formatCents(s.amountCents)}`,
    body: [s.product, s.payment, s.city].filter((p) => p && p !== "—").join(" · "),
    url: `/admin/pedidos/${s.id}`,
    sound: true,
    sale: s,
  };
}

/* ---------- Áudio ---------- */

let audio: HTMLAudioElement | null = null;
let unlocked = false;

function getAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(SALE_SOUND_URL);
    audio.preload = "auto";
  }
  return audio;
}

/**
 * Navegadores só deixam tocar som depois de um toque/tecla na página. No primeiro gesto o AdminPwa toca o
 * som mudo e pausa: a partir daí o mesmo elemento pode tocar sozinho quando entra venda (vale no iPhone também).
 */
export function unlockAudio(): void {
  if (unlocked) return;
  const a = getAudio();
  a.muted = true;
  a.play()
    .then(() => {
      a.pause();
      a.currentTime = 0;
      a.muted = false;
      unlocked = true;
    })
    .catch(() => {
      a.muted = false;
    });
}

export function audioUnlocked(): boolean {
  return unlocked;
}

/** Chave do "som de venda com o painel aberto" (App e avisos). Vale só neste aparelho; padrão: ligado. */
const SOUND_PREF_KEY = "aqb:saleSound";

export function saleSoundEnabled(): boolean {
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSaleSoundEnabled(on: boolean): void {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, on ? "on" : "off");
  } catch {
    // modo privado sem armazenamento: fica o padrão (ligado)
  }
}

/** Toca a caixa registradora. Devolve false se o navegador bloqueou (ainda sem toque na página). */
export async function playSaleSound(): Promise<boolean> {
  try {
    const a = getAudio();
    a.muted = false;
    a.currentTime = 0;
    await a.play();
    unlocked = true;
    return true;
  } catch {
    return false;
  }
}

/* ---------- Service worker e push ---------- */

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
}

export async function registerAdminSw(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: SW_SCOPE, updateViaCache: "none" });
  } catch {
    return null;
  }
}

export function base64UrlToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function sameKey(a: ArrayBuffer | null | undefined, b: Uint8Array): boolean {
  if (!a) return false;
  const x = new Uint8Array(a);
  if (x.length !== b.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== b[i]) return false;
  return true;
}

/* ---------- Instalação (Chrome/Android/desktop) ---------- */

export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

let installPrompt: BeforeInstallPromptEvent | null = null;

export function setInstallPrompt(e: BeforeInstallPromptEvent | null): void {
  installPrompt = e;
  window.dispatchEvent(new Event(INSTALL_EVENT));
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return installPrompt;
}
