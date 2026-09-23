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

/** Extrai uma mensagem legível de qualquer valor lançado. */
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
