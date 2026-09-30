"use client";

import Image from "next/image";
import { QrCode } from "lucide-react";
import { useId, useState } from "react";

/**
 * QR do Pix real (PixPay e PixWatch). A imagem vem pronta do servidor: a do gateway quando ele manda
 * data:image, senão o SVG gerado do próprio copia-e-cola (src/lib/pix/qr.ts). 240 px no computador, com
 * "Aponte a câmera do app do banco". No celular quem paga costuma estar no mesmo aparelho, então o QR
 * começa recolhido atrás de "Mostrar QR Code" e o copia-e-cola fica em primeiro plano (o CSS esconde o
 * botão no computador).
 */
export function PixQr({ src, dim = false }: { src: string; dim?: boolean }) {
  const [open, setOpen] = useState(false);
  const boxId = useId();
  return (
    <figure className={`ck-qr ck-qr-real${dim ? " is-dim" : ""}${open ? " is-open" : ""}`}>
      <button type="button" className="ck-qr-toggle" aria-expanded={open} aria-controls={boxId} onClick={() => setOpen((v) => !v)}>
        <QrCode size={18} aria-hidden="true" />
        {open ? "Esconder QR Code" : "Mostrar QR Code"}
      </button>
      <div className="ck-qr-box" id={boxId}>
        <Image src={src} alt="QR Code do Pix" width={240} height={240} unoptimized />
        <figcaption>Aponte a câmera do app do banco</figcaption>
      </div>
    </figure>
  );
}
