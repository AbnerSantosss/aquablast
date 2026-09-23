import Link from "next/link";
import { qs } from "@/lib/admin/format";

export function Pagination({ page, pages, total, base, params }: { page: number; pages: number; total: number; base: string; params: Record<string, string | undefined> }) {
  if (pages <= 1) return <p className="muted small">{total} registro(s)</p>;
  const link = (p: number) => `${base}${qs({ ...params, page: p > 1 ? p : undefined })}`;
  return (
    <nav className="pagination" aria-label="Paginação">
      <span className="muted small">
        {total} registro(s) · página {page} de {pages}
      </span>
      <div className="pagination-links">
        {page > 1 ? (
          <Link className="btn btn-sm btn-ghost" href={link(page - 1)}>
            ← Anterior
          </Link>
        ) : (
          <span className="btn btn-sm btn-ghost is-disabled">← Anterior</span>
        )}
        {page < pages ? (
          <Link className="btn btn-sm btn-ghost" href={link(page + 1)}>
            Próxima →
          </Link>
        ) : (
          <span className="btn btn-sm btn-ghost is-disabled">Próxima →</span>
        )}
      </div>
    </nav>
  );
}
