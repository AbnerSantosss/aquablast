/**
 * POST /api/checkout/simular-pix — apelido de /api/checkout/simular-pagamento (nome usado no contrato
 * entre agentes da wiki). Mesmas travas: só gateway simulado e 404 em produção com checkout próprio.
 */
export const dynamic = "force-dynamic";

export { POST } from "../simular-pagamento/route";
