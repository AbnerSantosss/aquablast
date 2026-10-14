import Link from "next/link";

const TABS = [
  { key: "dados", label: "Dados e API", path: "" },
  { key: "produtos", label: "Produtos", path: "/produtos" },
  { key: "checkout", label: "Checkout e gateway", path: "/checkout" },
] as const;

/** Cabeçalho comum das telas de uma empresa: nome, voltar à lista e abas. */
export function CompanyNav({ company, current }: { company: { id: string; name: string; slug: string; active: boolean }; current: (typeof TABS)[number]["key"] }) {
  return (
    <>
      <div className="page-head">
        <div>
          <p className="small">
            <Link href="/admin/empresas">← Empresas</Link>
          </p>
          <h1>{company.name}</h1>
          <p className="sub">
            <code>{company.slug}</code> · {company.active ? "ativa" : "inativa"} · checkout em <Link href={`/c/${company.slug}`}>/c/{company.slug}</Link>
          </p>
        </div>
      </div>
      <nav className="tabs" aria-label="Seções da empresa">
        {TABS.map((t) => (
          <Link key={t.key} className={t.key === current ? "is-active" : ""} href={`/admin/empresas/${company.id}${t.path}`} aria-current={t.key === current ? "page" : undefined}>
            {t.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
