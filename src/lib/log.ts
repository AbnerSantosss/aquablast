/**
 * Logger mínimo do servidor: uma linha JSON por evento em stderr (aparece em `docker logs`).
 * O projeto proíbe console.log; use log.info / log.warn / log.error.
 */
type Level = "info" | "warn" | "error";
type Meta = Record<string, unknown>;

function write(level: Level, msg: string, meta?: Meta): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, msg, ...meta });
  process.stderr.write(line + "\n");
}

export const log = {
  info: (msg: string, meta?: Meta): void => write("info", msg, meta),
  warn: (msg: string, meta?: Meta): void => write("warn", msg, meta),
  error: (msg: string, meta?: Meta): void => write("error", msg, meta),
};

/**
 * Extrai uma mensagem legível de qualquer valor lançado.
 * O fetch do Node só diz "fetch failed"; o motivo real (ENOTFOUND, ETIMEDOUT, ENETUNREACH...) vem em
 * `cause`. Sem ele, o painel mostrava "falha de rede (fetch failed)" e não dava para saber o que corrigir.
 */
export function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause: unknown = err.cause;
  if (!(cause instanceof Error)) return err.message;
  const code = (cause as Error & { code?: unknown }).code;
  const detail = [typeof code === "string" ? code : "", cause.message].filter(Boolean).join(" ");
  return detail ? `${err.message}: ${detail}`.slice(0, 200) : err.message;
}
