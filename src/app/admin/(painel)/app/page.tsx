import type { Metadata } from "next";
import Link from "next/link";
import { AppAvisos } from "@/components/admin/pwa/AppAvisos";
import { requireAdmin } from "@/lib/auth/session";
import { recentSales } from "@/lib/push/sales";
import { getSettings, PUSH_ALERT_EVENTS, type AdminAlertEvent } from "@/lib/settings";

export const metadata: Metadata = { title: "App e avisos" };

const EVENT_SHORT: Record<AdminAlertEvent, string> = {
  inicio: "checkout aberto",
  pagamento: "chegou no pagamento",
  pix: "Pix gerado",
  cartao: "cartão (aprovado, em análise, recusado)",
  falha: "falha no pagamento",
  pago: "venda paga",
  atraso: "postagem atrasada",
};

/**
 * App do painel (PWA "AquaBlast Painel", pedido do dono em 2026-09-30): liga os avisos no celular/computador,
 * testa, mostra as últimas vendas e ensina a instalar. Ver wiki/operacao/aquablast-app-vendas-pwa.md.
 */
export default async function AppPage() {
  await requireAdmin();
  const [sales, s] = await Promise.all([recentSales(), getSettings(["alerts.events", "alerts.pushEvents"] as const)]);
  const general: readonly string[] = s["alerts.events"];
  const active = s["alerts.pushEvents"].filter((ev) => general.includes(ev) && PUSH_ALERT_EVENTS.includes(ev));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>App e avisos</h1>
          <p className="sub">O painel como app no celular, com aviso de venda paga.</p>
        </div>
      </div>

      <div className="cols-2 split">
        <AppAvisos initialSales={sales} />

        <div className="stack">
          <section className="card">
            <div className="card-head">
              <h2>Instalar o app</h2>
            </div>
            <ol className="pwa-steps">
              <li>
                <strong>Android (Chrome):</strong> abra o painel, toque no menu ⋮ e em <em>Instalar app</em> (ou <em>Adicionar à tela inicial</em>).
              </li>
              <li>
                <strong>Computador (Chrome ou Edge):</strong> clique no ícone de instalar na barra de endereço, ou menu ⋮ &gt; <em>Instalar AquaBlast Painel</em>.
              </li>
              <li>
                <strong>iPhone (Safari, iOS 16.4 ou mais novo):</strong> toque em Compartilhar e em <em>Adicionar à Tela de Início</em>. Depois abra
                pelo ícone e ative os avisos lá dentro: no iPhone, o aviso só funciona no app instalado.
              </li>
              <li>
                O app abre no painel; sem login, cai na tela de entrada. Com o app instalado, toque em <em>Ativar avisos</em> e aceite as notificações.
              </li>
            </ol>
          </section>

          <section className="card">
            <div className="card-head">
              <h2>O que avisa no celular</h2>
            </div>
            {active.length ? (
              <ul className="pwa-events">
                {active.map((ev) => (
                  <li key={ev}>{EVENT_SHORT[ev]}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">Nenhum evento está ligado para o celular.</p>
            )}
            <p className="muted small">
              Só a venda paga avisa no celular, uma vez por pedido (checkout aberto, Pix gerado e cartão ficam só no e-mail). Troque em{" "}
              <Link href="/admin/configuracoes">Configurações &gt; Envios</Link>.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
