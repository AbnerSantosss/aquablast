/* eslint-disable @next/next/no-img-element */

// Sem aria-label: o nome acessível vem do texto visível (AquaBlast + DIVERSÃO QUE APROXIMA),
// o que evita o "label-content-name-mismatch" do Lighthouse. `lazy` é para o rodapé.
export function Brand({ lazy = false }: { lazy?: boolean }) {
  return (
    <a className="brand" href="#inicio">
      <img
        className="brand-symbol"
        src="/icons/droplets.svg"
        alt=""
        loading={lazy ? "lazy" : undefined}
        decoding={lazy ? "async" : undefined}
      />
      <span>
        Aqua<b>Blast</b>
        <small>DIVERSÃO QUE APROXIMA</small>
      </span>
    </a>
  );
}
