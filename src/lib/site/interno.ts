/**
 * Modo interno (pedido do dono, 2026-10-02): as visitas do dono e as de teste sujavam Clarity, GA e Pixel.
 * Abrir qualquer pagina com `?interno=1` grava `localStorage.ab_interno = "1"` neste navegador; `?interno=0`
 * remove. Com a flag ligada o site nao carrega GTM (GA4 + Pixel + Clarity da LP), nem o Clarity do checkout,
 * nem avisa o servidor da visita (PageTracker). Vale por navegador: ligar uma vez em cada aparelho do dono.
 */
export const INTERNO_KEY = "ab_interno";

/** Le `?interno=` da URL (grava/remove a flag) e devolve se o modo interno esta ligado. So no navegador. */
export function internoAtivo(): boolean {
  if (typeof window === "undefined") return false;
  let param: string | null = null;
  try {
    param = new URLSearchParams(window.location.search).get("interno");
    if (param === "1") window.localStorage.setItem(INTERNO_KEY, "1");
    else if (param === "0") window.localStorage.removeItem(INTERNO_KEY);
    return window.localStorage.getItem(INTERNO_KEY) === "1";
  } catch {
    // localStorage bloqueado (aba anonima de alguns navegadores): vale so o parametro desta pagina.
    return param === "1";
  }
}

/**
 * A mesma regra de `internoAtivo`, como expressao JS em texto, para o snippet inline do GTM (que roda fora do
 * React). Manter as duas iguais.
 */
export const INTERNO_CHECK_JS = `(function(){var p=null;try{p=new URLSearchParams(location.search).get('interno');if(p==='1')localStorage.setItem('${INTERNO_KEY}','1');else if(p==='0')localStorage.removeItem('${INTERNO_KEY}');return localStorage.getItem('${INTERNO_KEY}')==='1'}catch(e){return p==='1'}})()`;
