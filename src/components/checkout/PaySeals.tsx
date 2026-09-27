import { Droplets, FlaskConical, LockKeyhole, ShieldCheck } from "lucide-react";

/**
 * Peças pequenas repetidas no pagamento, portadas de ORIGEM/app/simulated-payment.tsx sem mudar texto nem classe
 * (fase 14.3, comparação visual): linha de selos abaixo do FINALIZAR COMPRA e o aviso de modo de teste.
 * O aviso só aparece quando o gateway do método é `simulado` (plano 8.6) — quem decide é quem chama.
 */
export function PaySeals({ storeName }: { storeName: string }) {
  return (
    <ul className="ck-payseals" aria-label="Segurança do pagamento">
      <li>
        <ShieldCheck aria-hidden="true" />
        <span>
          <b>Pagamento</b> <span>100% seguro</span>
        </span>
      </li>
      <li className="ck-payseals-brand">
        <Droplets aria-hidden="true" />
        <span>{storeName}</span>
      </li>
      <li>
        <LockKeyhole aria-hidden="true" />
        <span>
          <b>Site blindado</b> <span>Certificado SSL</span>
        </span>
      </li>
    </ul>
  );
}

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
