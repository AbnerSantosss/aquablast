"use client";
/* eslint-disable @next/next/no-img-element */

import Link from "next/link";
import { useEffect, useState } from "react";
import { Brand } from "./Brand";

export function Header() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const close = () => setOpen(false);

  return (
    <header className="header">
      <div className="container nav-inner">
        <Brand />
        <nav id="navigation" className={open ? "open" : undefined} aria-label="Navegação principal">
          <a href="#diversao" onClick={close}>
            A diversão
          </a>
          <a href="#familia" onClick={close}>
            Por que presentear
          </a>
          <a href="#ofertas" onClick={close}>
            Escolha o seu
          </a>
          <a href="#duvidas" onClick={close}>
            Dúvidas
          </a>
          <Link className="tracking-nav" href="/rastrear" onClick={close}>
            <img src="/icons/package-tracking.svg" alt="" loading="lazy" decoding="async" />
            Rastrear pedido
          </Link>
        </nav>
        <button
          className="menu-button"
          aria-label={open ? "Fechar menu" : "Abrir menu"}
          aria-controls="navigation"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <img className="icon" src={open ? "/icons/x.svg" : "/icons/menu.svg"} alt="" />
        </button>
      </div>
    </header>
  );
}
