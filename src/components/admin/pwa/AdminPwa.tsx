"use client";

import { X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RecentSale } from "@/lib/push/sales";
import {
  SALE_EVENT,
  SALES_POLL_MS,
  announce,
  markSeen,
  playSaleSound,
  saleSoundEnabled,
  registerAdminSw,
  saleToAnnouncement,
  setInstallPrompt,
  unlockAudio,
  type BeforeInstallPromptEvent,
  type SaleAnnouncement,
} from "./pwa-client";

type Toast = SaleAnnouncement & { key: number };

interface PushMessageData {
  type?: string;
  kind?: string;
  title?: string;
  body?: string;
  url?: string;
  orderId?: string | null;
}

/**
 * App do painel no navegador (montado no layout do painel, pedido do dono em 2026-09-30):
 * - registra o service worker (/admin-sw.js, escopo /admin) em toda página do painel;
 * - repassa os push que chegam com o painel aberto (mensagem do SW) como toast;
 * - consulta as vendas pagas a cada 20 s (funciona mesmo sem push) e anuncia as novas;
 * - toca a caixa registradora SÓ em venda (e no teste); outros eventos só mostram o toast;
 * - desbloqueia o áudio no primeiro toque/tecla (regra de autoplay dos navegadores).
 */
export function AdminPwa() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  // Toasts + som.
  useEffect(() => {
    function onSale(e: Event) {
      const detail = (e as CustomEvent<SaleAnnouncement>).detail;
      if (!detail) return;
      if (detail.sound && saleSoundEnabled()) void playSaleSound();
      const key = ++counter.current;
      setToasts((list) => [...list.slice(-2), { ...detail, key }]);
      window.setTimeout(() => setToasts((list) => list.filter((t) => t.key !== key)), 9000);
    }
    window.addEventListener(SALE_EVENT, onSale);
    return () => window.removeEventListener(SALE_EVENT, onSale);
  }, []);

  // Áudio liberado no primeiro gesto.
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // Service worker + mensagens do push + prompt de instalação.
  useEffect(() => {
    void registerAdminSw();
    function onMessage(e: MessageEvent<PushMessageData>) {
      const m = e.data;
      if (!m || m.type !== "aqb:push") return;
      const sale = m.kind === "sale";
      announce({
        id: sale ? (m.orderId ?? null) : null,
        title: String(m.title ?? "AquaBlast"),
        body: String(m.body ?? ""),
        url: typeof m.url === "string" && m.url.startsWith("/admin") ? m.url : "/admin",
        sound: sale || m.kind === "test",
      });
    }
    function onInstallable(e: Event) {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstallPrompt(null);
    }
    const sw = "serviceWorker" in navigator ? navigator.serviceWorker : null;
    sw?.addEventListener("message", onMessage);
    window.addEventListener("beforeinstallprompt", onInstallable);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      sw?.removeEventListener("message", onMessage);
      window.removeEventListener("beforeinstallprompt", onInstallable);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Polling das vendas pagas (20 s). A 1ª leitura só marca as vendas existentes como vistas.
  useEffect(() => {
    let since: string | null = null;
    let first = true;
    let stopped = false;
    // Aborta a consulta em andamento ao sair: resposta com corpo não lido fica "pendente" no navegador.
    const ctrl = new AbortController();
    async function tick() {
      try {
        const url = since ? `/api/admin/sales/recent?since=${encodeURIComponent(since)}` : "/api/admin/sales/recent";
        const res = await fetch(url, { cache: "no-store", credentials: "same-origin", signal: ctrl.signal });
        if (!res.ok) {
          await res.body?.cancel();
          return;
        }
        const data = (await res.json()) as { ok: boolean; sales?: RecentSale[] };
        if (stopped) return;
        const sales = Array.isArray(data.sales) ? data.sales : [];
        if (first) {
          sales.forEach((s) => markSeen(s.id));
          first = false;
        } else {
          for (const s of [...sales].reverse()) announce(saleToAnnouncement(s));
        }
        // Janela de 1 min antes da venda mais nova: cobre pedido gravado fora de ordem; o "já visto" evita repetir.
        if (sales[0]) since = new Date(Date.parse(sales[0].paidAt) - 60_000).toISOString();
      } catch {
        // Sem rede (ou abortado ao sair): tenta de novo no próximo ciclo.
      }
    }
    void tick();
    const id = window.setInterval(() => void tick(), SALES_POLL_MS);
    return () => {
      stopped = true;
      ctrl.abort();
      window.clearInterval(id);
    };
  }, []);

  // A região aria-live existe sempre (vazia), senão o leitor de tela pode não anunciar o 1º aviso.
  return (
    <div className="pwa-toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.key} className={`pwa-toast ${t.sound ? "is-sale" : ""}`}>
          <div className="pwa-toast-text">
            <strong>{t.title}</strong>
            {t.body ? <span>{t.body}</span> : null}
            <Link href={t.url} className="pwa-toast-link" onClick={() => setToasts((l) => l.filter((x) => x.key !== t.key))}>
              Abrir
            </Link>
          </div>
          <button type="button" className="pwa-toast-close" aria-label="Fechar aviso" onClick={() => setToasts((l) => l.filter((x) => x.key !== t.key))}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
