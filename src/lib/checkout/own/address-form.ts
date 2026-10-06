import type { FormData } from "@/components/checkout/types";

/** Um novo CEP não pode herdar endereço, número ou complemento do CEP anterior. */
export function changeAddressCep(data: FormData, cep: string): FormData {
  if (cep.replace(/\D/g, "") === data.cep.replace(/\D/g, "")) return { ...data, cep };
  return { ...data, cep, street: "", number: "", extra: "", district: "", city: "", state: "" };
}

/** CEP geral ou indisponível mantém só os dados que vieram desta consulta. */
export function fillAddressFromCep(data: FormData, address: Pick<FormData, "street" | "district" | "city" | "state">): FormData {
  return { ...data, ...address };
}
