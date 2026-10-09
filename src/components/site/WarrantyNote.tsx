import { ShieldCheck } from "lucide-react";

/** Resumo da politica publica; a pagina vinculada informa as condicoes completas. */
export function WarrantyNote() {
  return (
    <a className="summer-guarantee" href="/trocas-e-devolucoes">
      <ShieldCheck size={20} aria-hidden="true" />
      <span>Garantia de 7 dias para devolver após o recebimento.</span>
    </a>
  );
}
