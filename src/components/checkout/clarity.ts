import { CLARITY_ID } from "@/lib/site/constants";

/**
 * Carrega o Microsoft Clarity no checkout (o site publico carrega pelo GTM, que o checkout nao tem). Mesmo snippet
 * oficial; so roda uma vez por pagina. Chamado pelo Checkout depois do consentimento (ou direto, quando
 * `ads.consentRequired` esta desligado). O mascaramento "Equilibrado" do projeto esconde o que e digitado; os campos
 * do cartao ficam em iframe do gateway e o Clarity nao grava.
 */
export function loadClarity(): void {
  const w = window as Window & { clarity?: unknown };
  if (w.clarity || document.getElementById("ms-clarity")) return;
  const q: unknown[] = [];
  const fn = (...args: unknown[]) => {
    q.push(args);
  };
  w.clarity = Object.assign(fn, { q });
  const s = document.createElement("script");
  s.id = "ms-clarity";
  s.async = true;
  s.src = `https://www.clarity.ms/tag/${CLARITY_ID}`;
  document.head.appendChild(s);
}
