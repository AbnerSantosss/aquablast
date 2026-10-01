"use client";

import { BellOff, BellRing, Download, Send, Volume2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { RecentSale } from "@/lib/push/sales";
import {
  INSTALL_EVENT,
  SALE_EVENT,
  base64UrlToBytes,
  formatCents,
  getInstallPrompt,
  isStandalone,
  playSaleSound,
  saleSoundEnabled,
  SALE_SOUND_URL,
  setSaleSoundEnabled,
  pushSupported,
  registerAdminSw,
  sameKey,
  type SaleAnnouncement,
} from "./pwa-client";

type Status = "checking" | "unsupported" | "denied" | "off" | "on";

const STATUS_TEXT: Record<Status, string> = {
  checking: "Verificando…",
  unsupported: "Este navegador não recebe avisos. No iPhone, instale o app na Tela de Início (iOS 16.4 ou mais novo) e abra por ele.",
  denied: "Notificações bloqueadas para este site. Libere nas configurações do navegador (cadeado ao lado do endereço) e recarregue.",
  off: "Desligados neste aparelho.",
  on: "Ligados neste aparelho.",
};

async function postJson(url: string, method: "POST" | "DELETE", body: unknown): Promise<{ ok: boolean; error?: string; sent?: number; total?: number }> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; sent?: number; total?: number };
  return { ok: res.ok && data.ok !== false, error: data.error, sent: data.sent, total: data.total };
}

function hourOf(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Confere a inscrição do navegador e a mantém igual no servidor (e com a chave VAPID atual). */
async function readStatus(): Promise<Status> {
  if (!pushSupported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await registerAdminSw();
  if (!reg) return "unsupported";
  const sub = await reg.pushManager.getSubscription();
  if (!sub || Notification.permission !== "granted") return "off";
  try {
    const keyRes = await fetch("/api/admin/push/public-key", { cache: "no-store", credentials: "same-origin" });
    const keyData = (await keyRes.json()) as { publicKey?: string };
    if (keyData.publicKey && !sameKey(sub.options.applicationServerKey, base64UrlToBytes(keyData.publicKey))) {
      // Chave do servidor mudou: a inscrição antiga não recebe mais nada.
      await sub.unsubscribe();
      return "off";
    }
    await postJson("/api/admin/push/subscribe", "POST", sub.toJSON());
  } catch {
    // Sem rede agora: o status do navegador vale.
  }
  return "on";
}

/** Tela "App e avisos" (/admin/app): liga o push deste aparelho, testa, e lista as últimas vendas pagas. */
export function AppAvisos({ initialSales }: { initialSales: RecentSale[] }) {
  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [sales, setSales] = useState<RecentSale[]>(initialSales);
  const [installable, setInstallable] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [soundOn, setSoundOn] = useState(true);

  useEffect(() => {
    let alive = true;
    // Leitura de APIs do navegador (permissão, SW, display-mode): só existe depois de montar.
    void readStatus().then((st) => {
      if (!alive) return;
      setStatus(st);
      setStandalone(isStandalone());
      setInstallable(!!getInstallPrompt());
      setSoundOn(saleSoundEnabled());
    });
    const onInstall = () => setInstallable(!!getInstallPrompt());
    const onSale = (e: Event) => {
      const s = (e as CustomEvent<SaleAnnouncement>).detail?.sale;
      if (s) setSales((list) => [s, ...list.filter((x) => x.id !== s.id)].slice(0, 20));
    };
    window.addEventListener(INSTALL_EVENT, onInstall);
    window.addEventListener(SALE_EVENT, onSale);
    return () => {
      alive = false;
      window.removeEventListener(INSTALL_EVENT, onInstall);
      window.removeEventListener(SALE_EVENT, onSale);
    };
  }, []);

  async function activate() {
    setBusy(true);
    setMsg(null);
    try {
      if (!pushSupported()) {
        setStatus("unsupported");
        return;
      }
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? "denied" : "off");
        setMsg({ ok: false, text: "Sem permissão de notificação, os avisos não chegam." });
        return;
      }
      const reg = await registerAdminSw();
      if (!reg) throw new Error("Não deu para registrar o app neste navegador.");
      await navigator.serviceWorker.ready;
      const keyRes = await fetch("/api/admin/push/public-key", { cache: "no-store", credentials: "same-origin" });
      const keyData = (await keyRes.json()) as { publicKey?: string; error?: string };
      if (!keyRes.ok || !keyData.publicKey) throw new Error(keyData.error ?? "Chave do servidor indisponível.");
      const key = base64UrlToBytes(keyData.publicKey);
      let sub = await reg.pushManager.getSubscription();
      if (sub && !sameKey(sub.options.applicationServerKey, key)) {
        await sub.unsubscribe();
        sub = null;
      }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      const saved = await postJson("/api/admin/push/subscribe", "POST", sub.toJSON());
      if (!saved.ok) throw new Error(saved.error ?? "O servidor não guardou a inscrição.");
      setStatus("on");
      setMsg({ ok: true, text: "Avisos ligados neste aparelho. Toque em \"Testar aviso\" para conferir." });
    } catch (err) {
      setMsg({ ok: false, text: err instanceof Error ? err.message : "Não deu para ligar os avisos." });
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await registerAdminSw();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await postJson("/api/admin/push/subscribe", "DELETE", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setStatus("off");
      setMsg({ ok: true, text: "Avisos desligados neste aparelho." });
    } catch {
      setMsg({ ok: false, text: "Não deu para desligar agora. Tente de novo." });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await registerAdminSw();
      const sub = await reg?.pushManager.getSubscription();
      const r = await postJson("/api/admin/push/test", "POST", sub ? { endpoint: sub.endpoint } : {});
      setMsg(
        r.ok
          ? { ok: true, text: "Aviso de teste enviado. Deve aparecer em alguns segundos." }
          : { ok: false, text: r.error ?? "O serviço de push recusou o aviso. Desligue e ligue os avisos de novo." },
      );
    } catch {
      setMsg({ ok: false, text: "Sem conexão com o servidor." });
    } finally {
      setBusy(false);
    }
  }

  async function testSound() {
    const played = await playSaleSound();
    setMsg(played ? { ok: true, text: "Som de venda tocado." } : { ok: false, text: "O navegador bloqueou o som. Toque na página e tente de novo." });
  }

  function toggleSound(on: boolean) {
    setSoundOn(on);
    setSaleSoundEnabled(on);
  }

  async function install() {
    const p = getInstallPrompt();
    if (!p) return;
    await p.prompt();
    await p.userChoice.catch(() => null);
    setInstallable(false);
  }

  return (
    <div className="stack">
      <section className="card pwa-card">
        <div className="card-head">
          <h2>Avisos neste aparelho</h2>
          <span className={`badge tone-${status === "on" ? "green" : status === "checking" ? "gray" : "orange"}`}>
            {status === "on" ? "Ligados" : status === "checking" ? "…" : "Desligados"}
          </span>
        </div>
        <p className="pwa-status" data-status={status}>
          {STATUS_TEXT[status]}
        </p>
        <div className="pwa-actions">
          {status === "on" ? (
            <>
              <button type="button" className="btn btn-primary" onClick={test} disabled={busy}>
                <Send size={16} aria-hidden="true" /> Testar aviso
              </button>
              <button type="button" className="btn btn-ghost" onClick={deactivate} disabled={busy}>
                <BellOff size={16} aria-hidden="true" /> Desligar
              </button>
            </>
          ) : (
            <button type="button" className="btn btn-primary" onClick={activate} disabled={busy || status === "unsupported" || status === "checking"}>
              <BellRing size={16} aria-hidden="true" /> Ativar avisos
            </button>
          )}
          <button type="button" className="btn btn-outline" onClick={testSound}>
            <Volume2 size={16} aria-hidden="true" /> Ouvir o som de venda
          </button>
          {installable && !standalone ? (
            <button type="button" className="btn btn-blue" onClick={install}>
              <Download size={16} aria-hidden="true" /> Instalar app
            </button>
          ) : null}
        </div>
        {msg ? <p className={`flash ${msg.ok ? "is-ok" : "is-err"} pwa-msg`}>{msg.text}</p> : null}
        <p className="muted small pwa-note">
          Com o painel aberto, venda nova toca a caixa registradora (a página confere a cada 20 s). Com o app fechado chega a notificação do
          celular, com o som do aparelho (veja &quot;Som da venda&quot; abaixo). Quais eventos avisam: <Link href="/admin/configuracoes">Configurações &gt; Envios</Link>.
        </p>
      </section>

      <section className="card pwa-card">
        <div className="card-head">
          <h2>Som da venda</h2>
        </div>
        <label className="check">
          <input type="checkbox" checked={soundOn} onChange={(e) => toggleSound(e.target.checked)} />
          <span>Tocar a caixa registradora quando entrar venda com o painel aberto (só neste aparelho)</span>
        </label>
        <p className="muted small pwa-note">
          <strong>App Android AquaBlast 1.1 ou mais novo:</strong> já vem pronto. A notificação de venda toca a caixa registradora
          sozinha, mesmo com o app fechado (categoria &quot;Vendas (caixa registradora)&quot; nas notificações do app). Os outros
          avisos seguem com o som normal do celular.
        </p>
        <p className="muted small pwa-note">
          <strong>Pelo Chrome ou app antigo, com o app fechado,</strong> quem toca é o celular, não o site: nenhum site ou app
          instalado pelo navegador consegue escolher o som da notificação. No Android dá para trocar pelo som da caixa registradora:
        </p>
        <ol className="pwa-steps small">
          <li>
            Baixe o som: <a href={SALE_SOUND_URL} download="aquablast-venda.mp3">aquablast-venda.mp3</a> (fica na pasta Downloads).
          </li>
          <li>
            Abra <strong>Configurações &gt; Apps &gt; AquaBlast</strong> (se o app não aparecer, use <strong>Chrome</strong>) &gt;{" "}
            <strong>Notificações</strong>.
          </li>
          <li>
            Toque na categoria dos avisos (no Chrome, <strong>Sites</strong> &gt; aquablastbrasil.com.br) &gt; <strong>Som</strong> e
            escolha o arquivo baixado. Os nomes mudam um pouco de marca para marca de celular.
          </li>
        </ol>
        <p className="muted small pwa-note">No iPhone não dá para trocar: a notificação usa sempre o som padrão do iOS.</p>
      </section>

      <section className="card">
        <div className="card-head">
          <h2>Últimas vendas pagas</h2>
        </div>
        {sales.length ? (
          <ul className="pwa-sales">
            {sales.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/pedidos/${s.id}`} className="pwa-sale">
                  <span className="pwa-sale-time">{hourOf(s.paidAt)}</span>
                  <span className="pwa-sale-main">
                    <strong>{s.product}</strong>
                    <span className="muted small">{[`#${s.orderNumber}`, s.payment, s.city].filter((p) => p && p !== "—").join(" · ")}</span>
                  </span>
                  <span className="pwa-sale-value">{formatCents(s.amountCents)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Nenhuma venda paga ainda.</p>
        )}
      </section>
    </div>
  );
}
