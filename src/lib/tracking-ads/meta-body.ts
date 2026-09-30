/**
 * Partes puras do envio para a Meta (sem import): o e2e/20-integracoes-meta.cjs transpila este arquivo
 * e confere o corpo sem chamar a rede.
 *
 * Modo teste (pedido 2026-09-30, etapa D): o código de evento de teste fica salvo no painel, mas só vai
 * junto dos eventos REAIS do site quando o checkbox "Enviar como evento de teste" (ads.meta.testMode)
 * está ligado. Antes, qualquer código salvo ia em todos os eventos e a venda real sumia dos relatórios.
 * O botão "Testar envio" do painel continua sempre usando o código (é teste por definição).
 */

/** Código que acompanha um evento real do site: vazio com o modo teste desligado. */
export function effectiveTestEventCode(cfg: { testMode: boolean; testEventCode: string }): string {
  return cfg.testMode ? cfg.testEventCode.trim() : "";
}

/** Corpo do POST /<pixel>/events. `test_event_code` só entra quando há código. */
export function metaRequestBody(events: Record<string, unknown>[], testEventCode: string): Record<string, unknown> {
  const body: Record<string, unknown> = { data: events };
  const code = testEventCode.trim();
  if (code) body.test_event_code = code;
  return body;
}
