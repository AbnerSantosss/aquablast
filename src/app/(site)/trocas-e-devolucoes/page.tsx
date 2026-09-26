import type { Metadata } from "next";
import Link from "next/link";
import { JsonLdScript } from "@/components/site/JsonLd";
import { BRAND_NAME, CONTACT_EMAIL, RETURNS_PATH } from "@/lib/site/constants";
import {
  HOME_URL,
  OG_IMAGE,
  RETURN_POLICY_DAYS,
  RETURNS_DESCRIPTION,
  RETURNS_TITLE,
  RETURNS_UPDATED_AT,
  RETURNS_URL,
  SITE_URL,
} from "@/lib/site/seo";
import { getSupportWhatsapp, type SupportWhatsapp } from "@/lib/site/support-contact";
import "@/styles/site/trocas.css";

// Política de trocas e devoluções. Regra da loja (dono, 2026-09-26): produto que
// chegar quebrado ou avariado é substituído sem custo para o cliente; na desistência
// dentro do prazo legal, o frete de devolução também é por conta da AquaBlast, sem
// custo para o cliente (dono confirmou em 2026-09-26). O resto é o Código de Defesa
// do Consumidor (Lei 8.078/1990), com os números da lei: art. 49 (7 dias), art. 26,
// II (90 dias) e art. 18, § 1º (30 dias). Não publicar prazo interno, prazo de
// reembolso, endereço ou CNPJ sem confirmação do dono
// (wiki/conteudo/honestidade-e-confirmar.md).
//
// Cabeçalho e rodapé próprios: o Header/Footer da home usam âncoras relativas
// (#ofertas, #duvidas) que não funcionam fora da home.
//
// WhatsApp: só aparece quando o dono cadastra o número no painel
// (src/lib/site/support-contact.ts). Sem cadastro, a página não cita WhatsApp.

// ISR, como a home: estática, refeita no máximo a cada 5 min e na hora em que o painel
// salva "Loja" (revalidatePath). Valor literal: o Next exige número estaticamente analisável.
export const revalidate = 300;

export const metadata: Metadata = {
  title: { absolute: RETURNS_TITLE },
  description: RETURNS_DESCRIPTION,
  alternates: { canonical: RETURNS_PATH },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: RETURNS_PATH,
    siteName: BRAND_NAME,
    title: RETURNS_TITLE,
    description: RETURNS_DESCRIPTION,
    images: [OG_IMAGE],
  },
  twitter: {
    card: "summary_large_image",
    title: RETURNS_TITLE,
    description: RETURNS_DESCRIPTION,
    images: [OG_IMAGE],
  },
};

const PAGE_ID = `${RETURNS_URL}#webpage`;
const BREADCRUMB_ID = `${RETURNS_URL}#breadcrumb`;

// Liga a página às entidades do @graph da home pelos mesmos @id (Organization e WebSite).
const pageGraph = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebPage",
      "@id": PAGE_ID,
      url: RETURNS_URL,
      name: RETURNS_TITLE,
      description: RETURNS_DESCRIPTION,
      isPartOf: { "@id": `${SITE_URL}/#website` },
      about: { "@id": `${SITE_URL}/#organization` },
      publisher: { "@id": `${SITE_URL}/#organization` },
      breadcrumb: { "@id": BREADCRUMB_ID },
      inLanguage: "pt-BR",
      dateModified: RETURNS_UPDATED_AT,
    },
    {
      "@type": "BreadcrumbList",
      "@id": BREADCRUMB_ID,
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Início", item: HOME_URL },
        { "@type": "ListItem", position: 2, name: "Trocas e devoluções", item: RETURNS_URL },
      ],
    },
  ],
};

/** "2026-09-26" -> "26/09/2026". */
const UPDATED_LABEL = RETURNS_UPDATED_AT.split("-").reverse().join("/");
const MAILTO = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Trocas e devoluções")}`;

/** Gota da marca (mesmo desenho de /icons/droplets.svg, lucide), em SVG inline: sem tag de imagem nem requisição extra. */
function BrandMark() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z" />
      <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97" />
    </svg>
  );
}

/** Link de conversa no WhatsApp (abre em nova aba). */
function WhatsappLink({ whatsapp, children }: { whatsapp: SupportWhatsapp; children: string }) {
  return (
    <a href={whatsapp.href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

function Brand() {
  return (
    <Link className="tr-brand" href="/">
      <BrandMark />
      <span>
        Aqua<b>Blast</b>
      </span>
    </Link>
  );
}

export default async function TrocasEDevolucoesPage() {
  // null (sem cadastro no painel ou sem banco) = nenhum WhatsApp na página.
  const whatsapp = await getSupportWhatsapp();
  return (
    <div className="tr-page">
      <JsonLdScript data={pageGraph} />
      <a className="skip" href="#conteudo">
        Pular para o conteúdo
      </a>

      <header className="tr-header">
        <div className="tr-bar">
          <Brand />
          <Link className="tr-cta" href="/#ofertas">
            Ver ofertas
          </Link>
        </div>
      </header>

      <main id="conteudo" className="tr-main">
        <div className="tr-hero">
          <div className="tr-wrap">
            <nav className="tr-crumbs" aria-label="Você está aqui">
              <ol>
                <li>
                  <Link href="/">Início</Link>
                </li>
                <li>
                  <span className="tr-sep" aria-hidden="true">
                    ›
                  </span>
                  <span aria-current="page">Trocas e devoluções</span>
                </li>
              </ol>
            </nav>
            <h1>Política de trocas e devoluções</h1>
            <p className="tr-updated">
              Atualizada em <time dateTime={RETURNS_UPDATED_AT}>{UPDATED_LABEL}</time>
            </p>
            <p className="tr-lead">
              Queremos que o seu AquaBlast chegue certinho e que a brincadeira comece logo. Se algo não sair como
              esperado, aqui você encontra o que fazer. Esta política segue o Código de Defesa do Consumidor (Lei nº
              8.078/1990) e não limita nenhum direito que a lei garante a você.
            </p>
          </div>
        </div>

        <div className="tr-wrap tr-body">
          <div className="tr-summary">
            <p className="tr-summary-title">Em resumo</p>
            <ul>
              <li>
                <strong>Chegou quebrado ou com defeito?</strong> Enviamos outro sem custo para você.
              </li>
              <li>
                <strong>Desistiu da compra?</strong> Você pode desistir em até {RETURN_POLICY_DAYS} dias, contados do
                recebimento, e o frete de devolução é por nossa conta.
              </li>
              <li>
                <strong>Para qualquer pedido,</strong> escreva para <a href={MAILTO}>{CONTACT_EMAIL}</a>
                {whatsapp ? (
                  <>
                    {" "}
                    ou chame no <WhatsappLink whatsapp={whatsapp}>{`WhatsApp ${whatsapp.label}`}</WhatsappLink>
                  </>
                ) : null}{" "}
                com o número do pedido.
              </li>
            </ul>
          </div>

          <section className="tr-section" aria-labelledby="quebrado">
            <h2 id="quebrado">Produto chegou quebrado ou com defeito</h2>
            <p>
              Se o seu AquaBlast chegar quebrado, avariado ou com defeito, nós enviamos outro sem custo para você, com o
              frete do novo envio por nossa conta.
            </p>
            <p>
              Avise o quanto antes, de preferência logo depois de abrir a caixa. Mande fotos ou um vídeo que mostrem o
              produto e a embalagem, junto com o número do pedido. Se for preciso devolver o item avariado, nós
              orientamos como fazer o envio.
            </p>
            <div className="tr-law">
              <p>
                Além disso, o Código de Defesa do Consumidor dá a você 90 dias, a contar da entrega, para reclamar de
                defeito aparente ou de fácil constatação em produto durável (art. 26, II). Se o defeito não for
                resolvido em até 30 dias, a lei permite que você escolha entre a substituição por outro produto da
                mesma espécie, em perfeitas condições de uso, a restituição do valor pago ou o abatimento proporcional
                do preço (art. 18, § 1º).
              </p>
            </div>
          </section>

          <section className="tr-section" aria-labelledby="desistencia">
            <h2 id="desistencia">Desistência da compra ({RETURN_POLICY_DAYS} dias)</h2>
            <p>
              Mudou de ideia? Em compras feitas fora do estabelecimento comercial, como as feitas pela internet, o art.
              49 do Código de Defesa do Consumidor garante o direito de desistir em até {RETURN_POLICY_DAYS} dias,
              contados a partir do dia em que você recebeu o produto. Não é preciso justificar a desistência.
            </p>
            <p>
              Ao desistir dentro desse prazo, você recebe de volta os valores pagos, inclusive o frete da compra, se
              ele tiver sido cobrado. O frete para devolver o produto também é por nossa conta, sem custo para você:
              para pedir a desistência, escreva para nós dentro dos {RETURN_POLICY_DAYS} dias e nós orientamos como
              fazer o envio de volta.
            </p>
          </section>

          <section className="tr-section" aria-labelledby="como-solicitar">
            <h2 id="como-solicitar">Como solicitar</h2>
            <p>Vale tanto para produto com defeito quanto para desistência da compra:</p>
            <ol className="tr-steps">
              <li>
                Escreva para <a href={MAILTO}>{CONTACT_EMAIL}</a>
                {whatsapp ? (
                  <>
                    {" "}
                    ou chame no <WhatsappLink whatsapp={whatsapp}>{`WhatsApp ${whatsapp.label}`}</WhatsappLink>
                  </>
                ) : null}{" "}
                informando o número do pedido.
              </li>
              <li>Conte o que aconteceu: produto quebrado, avariado ou com defeito, ou desistência da compra.</li>
              <li>Se o produto chegou com problema, anexe fotos ou um vídeo do produto e da embalagem.</li>
              <li>Aguarde a nossa resposta com a orientação de envio antes de mandar qualquer produto de volta.</li>
            </ol>
          </section>

          <section className="tr-section" aria-labelledby="condicoes">
            <h2 id="condicoes">Condições do produto na devolução</h2>
            <p>
              Quando for preciso devolver o produto, envie-o de preferência na embalagem original, com todos os
              acessórios e itens que vieram na caixa.
            </p>
            <p>
              Guarde a embalagem e os itens até a troca ou a devolução terminar: eles podem ser pedidos nas fotos ou no
              envio.
            </p>
          </section>

          <section className="tr-section" aria-labelledby="reembolso">
            <h2 id="reembolso">Reembolso</h2>
            <p>Quando houver devolução de valor, o estorno é feito pelo mesmo meio de pagamento usado na compra:</p>
            <ul>
              <li>
                <strong>Pix:</strong> o valor volta para a conta de origem do pagamento.
              </li>
              <li>
                <strong>Cartão de crédito:</strong> o estorno é solicitado à operadora do cartão, e o crédito aparece na
                fatura conforme as regras da operadora e do banco emissor.
              </li>
            </ul>
          </section>

          <section className="tr-section" aria-labelledby="contato">
            <h2 id="contato">Contato</h2>
            <div className="tr-contact">
              <p>
                Ficou com alguma dúvida sobre trocas e devoluções? Fale com a gente por e-mail
                {whatsapp ? " ou pelo WhatsApp" : ""}:
              </p>
              <p className="tr-email">
                <a href={MAILTO}>{CONTACT_EMAIL}</a>
              </p>
              {whatsapp ? (
                <p className="tr-email">
                  <WhatsappLink whatsapp={whatsapp}>{`WhatsApp ${whatsapp.label}`}</WhatsappLink>
                </p>
              ) : null}
              <div className="tr-actions">
                <a className="tr-btn tr-btn-green" href={MAILTO}>
                  Enviar e-mail
                </a>
                <Link className="tr-btn tr-btn-outline" href="/rastrear">
                  Rastrear pedido
                </Link>
              </div>
              <p className="tr-contact-note">
                Para acompanhar a entrega de uma compra, use a página Rastrear pedido, com o código de acesso enviado na
                confirmação da compra.
              </p>
            </div>
          </section>
        </div>
      </main>

      <footer className="tr-footer">
        <div className="tr-footer-inner">
          <div>
            <Brand />
            <p className="tr-footer-tagline">Diversão que aproxima.</p>
          </div>
          <nav aria-label="Rodapé">
            <ul>
              <li>
                <Link href="/">Voltar para a loja</Link>
              </li>
              <li>
                <Link href="/#ofertas">Ver ofertas</Link>
              </li>
              <li>
                <Link href="/rastrear">Rastrear pedido</Link>
              </li>
              <li>
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              </li>
              {whatsapp ? (
                <li>
                  <WhatsappLink whatsapp={whatsapp}>{`WhatsApp: ${whatsapp.label}`}</WhatsappLink>
                </li>
              ) : null}
            </ul>
          </nav>
        </div>
        <p className="tr-footer-bottom">© 2026 AquaBlast. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}
