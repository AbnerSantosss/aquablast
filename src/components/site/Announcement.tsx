/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { DELIVERY_PATH } from "@/lib/site/constants";

export function SkipLink() {
  return (
    <a className="skip" href="#conteudo">
      Pular para o conteúdo
    </a>
  );
}

export function Announcement() {
  return (
    <div className="announcement">
      <div className="container announcement-inner">
        <span>
          <img className="icon" src="/icons/truck.svg" alt="" /> Envio Full rápido
        </span>
        <span>
          <img className="icon" src="/icons/shield-check.svg" alt="" /> Compra segura
        </span>
        <span>
          <img className="icon" src="/icons/badge-check.svg" alt="" /> Produto original
        </span>
        <span className="announcement-message">Dia das Crianças • Diversão que aproxima</span>
      </div>
    </div>
  );
}

// Aviso com validade (pedido do dono, 04/10): o texto e a data limite moram em lib/site/delivery-promise.ts (config
// única, a mesma do topo do celular, dos cards e do checkout) e chegam por prop, já decididos no servidor. Depois da
// data a faixa volta sozinha ao texto anterior; a home é regerada a cada 5 min (revalidate), sem deploy.
function TickerGroup({ hidden, promise }: { hidden?: boolean; promise: string | null }) {
  return (
    <div className="ticker-group" aria-hidden={hidden ? "true" : undefined}>
      <span className="ticker-message">
        <span className="ticker-icon">
          <img src="/icons/truck.svg" alt="" />
        </span>
        {promise ? (
          <span>{promise}</span>
        ) : (
          <span>
            Entrega <strong className="ticker-full">FULL</strong>
          </span>
        )}
      </span>
      <span className="ticker-message">
        <span className="ticker-icon">
          <img src="/icons/badge-check.svg" alt="" />
        </span>
        <span>
          Estoque <strong>abastecido</strong>
        </span>
      </span>
      <span className="ticker-message">
        <span className="ticker-icon">
          <img src="/icons/heart.svg" alt="" />
        </span>
        <span>
          Presenteie no <strong>Dia das Crianças</strong>
        </span>
      </span>
    </div>
  );
}

export function DeliveryTicker({ promise }: { promise: string | null }) {
  return (
    // A faixa inteira é um link para a página de entrega (pedido do dono, 04/10: o Clarity mostrou muito clique
    // nela e não levava a lugar nenhum). O movimento continua parando com foco ou ponteiro em cima.
    <Link
      className="delivery-ticker"
      href={DELIVERY_PATH}
      aria-label={`${
        promise ? `${promise}; estoque abastecido` : "Entrega Full, estoque abastecido e Dia das Crianças"
      }. Ver como funciona a entrega`}
    >
      <div className="ticker-window">
        <div className="ticker-track">
          <TickerGroup promise={promise} />
          <TickerGroup hidden promise={promise} />
        </div>
      </div>
    </Link>
  );
}
