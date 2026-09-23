/** Mensagens vindas por querystring (?ok=... / ?erro=...), usadas após redirects. */
export function Flash({ ok, erro }: { ok?: string; erro?: string }) {
  if (!ok && !erro) return null;
  return (
    <div className={`flash ${erro ? "is-err" : "is-ok"}`} role="status">
      {erro ?? ok}
    </div>
  );
}
