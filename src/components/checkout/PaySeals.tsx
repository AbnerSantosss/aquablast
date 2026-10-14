import Link from "next/link";
import { FlaskConical, Landmark, LockKeyhole, MessageCircle, Store, Undo2 } from "lucide-react";
import type { Theme } from "@/lib/checkout/own/theme";
import type { GatewayName } from "@/lib/gateways/types";
import { RETURNS_PATH } from "@/lib/site/constants";

/** Contato do rodapé: WhatsApp do painel ou, sem ele, o e-mail do site (`loadCheckoutProps`). */
export type SupportLink = { href: string; external: boolean };

/**
 * Nome público de cada processador real, igual ao de `GATEWAY_LABELS` (`src/lib/gateways/index.ts`, módulo de
 * servidor). O tipo obriga a decidir o nome quando entrar um gateway novo. O `simulado` fica de fora de propósito:
 * não processa pagamento nenhum.
 */
const PROCESSOR_NAMES: Record<Exclude<GatewayName, "simulado">, string> = {
  ironpay: "IronPay",
  mercadopago: "Mercado Pago",
  fastpay: "FastPay",
};

/** Nome do processador para mostrar ao cliente, ou `null` quando não há nome confiável (simulado, vazio, desconhecido). */
export function processorName(gateway: string | null): string | null {
  if (!gateway || !Object.prototype.hasOwnProperty.call(PROCESSOR_NAMES, gateway)) return null;
  return PROCESSOR_NAMES[gateway as keyof typeof PROCESSOR_NAMES];
}

/** Quem vende: razão social do tema ou, sem ela, o nome da loja, com o CNPJ quando cadastrado (mesma fonte do rodapé). */
export function sellerLine(theme: Pick<Theme, "storeName" | "companyName" | "companyCnpj">): string {
  const name = theme.companyName || theme.storeName;
  return theme.companyCnpj ? `${name} · CNPJ ${theme.companyCnpj}` : name;
}

/**
 * Desistência em 7 dias (`RETURN_POLICY_DAYS` em `src/lib/site/seo.ts`, módulo de servidor) com a política em nova aba.
 * Frase curta de propósito: com o link, cabe em uma linha na coluna de pagamento do computador.
 * `ck-fact-link` (payment-ux.css) dá a cor e, na tela de toque, a área de 44 px; `-tail` é o link que pode cair no
 * fim de uma frase quebrada em duas linhas: a área de toque cresce para cima, para não invadir o link da linha de baixo.
 */
export function WithdrawalFact() {
  return (
    <>
      Você pode desistir em até 7 dias após o recebimento.{" "}
      <Link className="ck-fact-link ck-fact-link-tail" href={RETURNS_PATH} target="_blank" rel="noopener noreferrer">
        Como funciona<span className="ck-u-sr-only"> (abre em nova aba)</span>
      </Link>
    </>
  );
}

/** Ajuda: mesmo destino do "Fale com a gente" do rodapé. */
export function HelpFact({ support }: { support: SupportLink }) {
  // Empresa sem canal de atendimento próprio (multiempresa): sem link, em vez de cair no do AquaBlast.
  if (!support.href) return null;
  return (
    <>
      Precisa de ajuda?{" "}
      <a className="ck-fact-link" href={support.href} {...(support.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
        Fale com nossa equipe
      </a>
    </>
  );
}

/**
 * Fatos verificáveis junto do botão de pagar (auditoria de 2026-10-11): quem vende, quem processa o pagamento,
 * desistência em 7 dias e ajuda. Substitui a antiga linha de selos `ck-payseals`. O processador só aparece com
 * gateway real de nome conhecido. "Dados do cartão não armazenados" não se repete aqui: já está no aviso do topo do
 * formulário do cartão (CardPay), e sem ele o bloco cabe em três linhas na coluna do computador.
 */
export function PayTrust({
  theme,
  gateway,
  support,
}: {
  theme: Pick<Theme, "storeName" | "companyName" | "companyCnpj">;
  gateway: string | null;
  support: SupportLink;
}) {
  const processor = processorName(gateway);
  return (
    <ul className="ck-paytrust" aria-label="Informações da compra">
      <li>
        <Store aria-hidden="true" />
        <p>Vendido por {sellerLine(theme)}</p>
      </li>
      {processor ? (
        <li>
          <Landmark aria-hidden="true" />
          <p>Pagamento processado por {processor}</p>
        </li>
      ) : null}
      <li className="has-link">
        <Undo2 aria-hidden="true" />
        <p>
          <WithdrawalFact />
        </p>
      </li>
      <li className="has-link">
        <MessageCircle aria-hidden="true" />
        <p>
          <HelpFact support={support} />
        </p>
      </li>
      <li>
        <LockKeyhole aria-hidden="true" />
        <p>Conexão criptografada</p>
      </li>
    </ul>
  );
}

/** Aviso de modo de teste: só aparece quando o gateway do método é `simulado` (plano 8.6); quem decide é quem chama. */
export function TestModeNote() {
  return (
    <p className="ck-testmode">
      <FlaskConical size={18} aria-hidden="true" />
      <span>
        <strong>Modo de teste:</strong> compra simulada. Nenhuma cobrança é feita e nenhum pedido real é criado.
      </span>
    </p>
  );
}

/**
 * QR de DEMONSTRAÇÃO da origem (`DemoQr`): módulos pseudoaleatórios + três quadrados de canto. NÃO é um BR Code
 * e não pode ser pago — por isso só é usado com o gateway `simulado` (cujo código "SIMULADO-NAO-PAGUE-..." também
 * não é pagável). Com gateway real sem `qrUrl`, o PixPay mostra só o copia e cola (plano 8.6).
 */
function qrPath(seed: string): string {
  const N = 29;
  let h = 2166136261;
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  h = h || 1;
  const rnd = () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
  const corner = (x: number, y: number, cx: number, cy: number): boolean | null => {
    const dx = x - cx;
    const dy = y - cy;
    if (dx < -1 || dx > 7 || dy < -1 || dy > 7) return null;
    if (dx < 0 || dx > 6 || dy < 0 || dy > 6) return false;
    return Math.max(Math.abs(dx - 3), Math.abs(dy - 3)) !== 2;
  };
  let d = "";
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const f = corner(x, y, 0, 0) ?? corner(x, y, N - 7, 0) ?? corner(x, y, 0, N - 7);
      if (f ?? rnd() < 0.5) d += `M${x + 2} ${y + 2}h1v1h-1z`;
    }
  return d;
}

export function DemoQr({ seed, dim }: { seed: string; dim?: boolean }) {
  const d = qrPath(seed);
  return (
    <figure className={`ck-qr${dim ? " is-dim" : ""}`}>
      <svg viewBox="0 0 33 33" role="img" aria-label="QR Code de demonstração (não pagável)" shapeRendering="crispEdges">
        <rect width="33" height="33" fill="#fff" />
        <path d={d} fill="#0b1f33" />
      </svg>
      <figcaption>QR Code de demonstração</figcaption>
    </figure>
  );
}
