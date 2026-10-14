import { ShieldCheck } from "lucide-react";

/** Resumo da politica publica; a pagina vinculada informa as condicoes completas. */
export function WarrantyNote() {
  return (
    <a className="summer-guarantee" href="/trocas-e-devolucoes">
      <ShieldCheck size={20} aria-hidden="true" />
      <span><strong>Garantia Brincadeira Sem Risco:</strong> 7 dias para devolver após o recebimento, com o frete de volta por nossa conta.</span>
    </a>
  );
}
