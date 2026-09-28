/**
 * Símbolo oficial do Pix (pedido do dono, 2026-09-28: "o selo do pix é esse"). Caminhos do arquivo
 * "Pix (Brazil) logo.svg" do Wikimedia Commons (domínio público, crédito Banco Central do Brasil), só a
 * parte do símbolo, sem o texto; cor oficial #32BCAD. Não recolorir nem distorcer: é a marca do Pix,
 * usada aqui só para indicar que a loja aceita Pix.
 */
export function PixLogo({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="535.5 26.5 78.7 78.6" aria-hidden="true" focusable="false">
      <path fill="#32BCAD" d="m 596.83,86.62 c -3.08,0 -5.98,-1.2 -8.16,-3.38 l -11.78,-11.78 c -0.83,-0.83 -2.27,-0.83 -3.09,0 l -11.82,11.82 c -2.18,2.18 -5.08,3.38 -8.16,3.38 h -2.32 l 14.92,14.92 c 4.66,4.66 12.21,4.66 16.87,0 l 14.96,-14.96 z" />
      <path fill="#32BCAD" d="m 553.82,44.96 c 3.08,0 5.98,1.2 8.16,3.38 l 11.82,11.82 c 0.85,0.85 2.24,0.85 3.09,-10e-4 l 11.78,-11.78 c 2.18,-2.18 5.08,-3.38 8.16,-3.38 h 1.42 l -14.96,-14.96 c -4.66,-4.66 -12.21,-4.66 -16.87,0 l -14.92,14.92 z" />
      <path fill="#32BCAD" d="m 610.62,57.38 -9.04,-9.04 c -0.2,0.08 -0.41,0.13 -0.64,0.13 h -4.11 c -2.12,0 -4.2,0.86 -5.71,2.36 l -11.78,11.78 c -1.1,1.1 -2.55,1.65 -4,1.65 -1.45,0 -2.9,-0.55 -4,-1.65 l -11.82,-11.82 c -1.5,-1.5 -3.58,-2.36 -5.71,-2.36 h -5.05 c -0.22,0 -0.42,-0.05 -0.61,-0.12 l -9.08,9.08 c -4.66,4.66 -4.66,12.21 0,16.87 l 9.07,9.07 c 0.19,-0.07 0.39,-0.12 0.61,-0.12 h 5.05 c 2.12,0 4.2,-0.86 5.71,-2.36 l 11.82,-11.82 c 2.14,-2.13 5.86,-2.14 8,0 l 11.78,11.78 c 1.5,1.5 3.58,2.36 5.71,2.36 h 4.11 c 0.23,0 0.44,0.05 0.64,0.13 l 9.04,-9.04 c 4.66,-4.66 4.66,-12.21 0,-16.87" />
    </svg>
  );
}
