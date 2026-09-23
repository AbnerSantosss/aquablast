/* eslint-disable @next/next/no-img-element */

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

function TickerGroup({ hidden }: { hidden?: boolean }) {
  return (
    <div className="ticker-group" aria-hidden={hidden ? "true" : undefined}>
      <span className="ticker-message">
        <span className="ticker-icon">
          <img src="/icons/truck.svg" alt="" />
        </span>
        <span>
          Entrega <strong className="ticker-full">FULL</strong>
        </span>
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

export function DeliveryTicker() {
  return (
    // aria-description vem do HTML original; o plugin a11y ainda não a reconhece em role=region.
    // eslint-disable-next-line jsx-a11y/role-supports-aria-props
    <div
      className="delivery-ticker"
      role="region"
      tabIndex={0}
      aria-label="Entrega Full, estoque abastecido e Dia das Crianças"
      aria-description="O movimento para enquanto esta faixa recebe foco ou o ponteiro está sobre ela."
    >
      <div className="ticker-window">
        <div className="ticker-track">
          <TickerGroup />
          <TickerGroup hidden />
        </div>
      </div>
    </div>
  );
}
