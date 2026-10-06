"use client";

import Image from "next/image";

/**
 * QR do Pix real (PixPay e PixWatch). A imagem vem pronta do servidor: a do gateway quando ele manda
 * data:image, senão o SVG gerado do próprio copia-e-cola (src/lib/pix/qr.ts). 240 px no computador, com
 * "Aponte a câmera do app do banco". Fica sempre visível, inclusive na página retomada pelo celular;
 * o código copia e cola aparece antes dele quando a pessoa paga no mesmo aparelho.
 */
export function PixQr({ src, dim = false }: { src: string; dim?: boolean }) {
  return (
    <figure className={`ck-qr ck-qr-real is-open${dim ? " is-dim" : ""}`}>
      <div className="ck-qr-box">
        <Image src={src} alt="QR Code do Pix" width={240} height={240} unoptimized />
        <figcaption>Aponte a câmera do app do banco</figcaption>
      </div>
    </figure>
  );
}
