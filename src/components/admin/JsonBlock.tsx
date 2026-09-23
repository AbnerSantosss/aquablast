import { prettyJson } from "@/lib/admin/format";

export function JsonBlock({ value, summary = "Ver JSON", open = false }: { value: unknown; summary?: string; open?: boolean }) {
  return (
    <details className="json-block" open={open}>
      <summary>{summary}</summary>
      <pre className="mono">{prettyJson(value)}</pre>
    </details>
  );
}
