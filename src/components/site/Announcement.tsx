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

// Aviso com validade (pedido do dono, 04/10): vale só nesta semana. Depois de sábado, 10/10, a faixa volta
// sozinha ao texto anterior; a home é regerada a cada 5 min (revalidate), então a troca não pede deploy.
const WEEK_NOTICE_ENDS_AT = Date.parse("2026-10-11T00:00:00-03:00");
const weekNoticeActive = () => Date.now() < WEEK_NOTICE_ENDS_AT;

function TickerGroup({ hidden, weekNotice }: { hidden?: boolean; weekNotice: boolean }) {
  return (
    <div className="ticker-group" aria-hidden={hidden ? "true" : undefined}>
      <span className="ticker-message">
        <span className="ticker-icon">
          <img src="/icons/truck.svg" alt="" />
        </span>
        {weekNotice ? (
          <span>
            Só esta semana: entrega <strong className="ticker-full">FULL</strong> — chega antes do Dia das Crianças nas capitais
          </span>
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

export function DeliveryTicker() {
  const weekNotice = weekNoticeActive();
  return (
    // aria-description vem do HTML original; o plugin a11y ainda não a reconhece em role=region.
    // eslint-disable-next-line jsx-a11y/role-supports-aria-props
    <div
      className="delivery-ticker"
      role="region"
      tabIndex={0}
      aria-label={
        weekNotice
          ? "Só esta semana: entrega Full, chega antes do Dia das Crianças nas capitais; estoque abastecido"
          : "Entrega Full, estoque abastecido e Dia das Crianças"
      }
      aria-description="O movimento para enquanto esta faixa recebe foco ou o ponteiro está sobre ela."
    >
      <div className="ticker-window">
        <div className="ticker-track">
          <TickerGroup weekNotice={weekNotice} />
          <TickerGroup hidden weekNotice={weekNotice} />
        </div>
      </div>
    </div>
  );
}
