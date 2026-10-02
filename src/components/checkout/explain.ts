import { validCPF } from "@/lib/checkout/own/masks";
import type { FieldKey, FormData } from "./types";

/**
 * Mensagens explícitas para o que trava o cliente no checkout (pedido do dono, 2026-10-02): em vez de "inválido",
 * diz exatamente o que está errado e como corrigir. O formulário da etapa 1 não tinha `noValidate`, então o navegador
 * barrava o envio com o balão nativo dele (no navegador do Instagram/Facebook às vezes nem aparece) e o botão
 * parecia travado. Agora tudo passa por aqui e vira o popup do checkout.
 */
export interface Problem {
  field: FieldKey;
  title: string;
  message: string;
}

/** Mesmo padrão do `z.email()` do servidor (zod 4), para o navegador não aceitar o que o servidor recusa. */
const EMAIL_RE = /^(?:[A-Za-z0-9_'+-]+\.)*[A-Za-z0-9_'+-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

export const emailOk = (v: string) => v.trim().length <= 160 && EMAIL_RE.test(v.trim());

export function emailProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Digite o seu e-mail. É por ele que enviamos a confirmação e o rastreio do pedido.";
  if (emailOk(v)) return null;
  if (!v.includes("@")) return `O e-mail "${v}" está sem o @. Exemplo de e-mail certo: nome@gmail.com`;
  if (v.split("@").length > 2) return `O e-mail "${v}" tem mais de um @. Deixe só um, como em nome@gmail.com`;
  if (/\s/.test(v)) return `O e-mail "${v}" tem espaço no meio. Apague o espaço e confira de novo.`;
  if (v.includes(",")) return `O e-mail "${v}" tem vírgula. Troque a vírgula por ponto, como em nome@gmail.com`;
  if (/[^ -~]/.test(v)) return `O e-mail "${v}" tem acento ou ç. E-mail não aceita acento: confira como ele foi criado.`;
  const [user, domain = ""] = v.split("@");
  if (!user) return `Falta a parte antes do @ no e-mail "${v}". Exemplo: nome@gmail.com`;
  if (!domain) return `O e-mail "${v}" termina no @. Complete com o provedor, como @gmail.com ou @hotmail.com`;
  if (!domain.includes(".")) return `O e-mail "${v}" está incompleto depois do @. Falta o final, como ".com": nome@${domain}.com`;
  if (/\.$/.test(domain) || /\.\./.test(v)) return `O e-mail "${v}" tem um ponto sobrando. Confira o final, como em nome@gmail.com`;
  return `O e-mail "${v}" não parece válido. Confira se está igual ao que você usa, como nome@gmail.com`;
}

export function phoneProblem(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (!d) return "Digite o seu celular com DDD. Usamos só para avisar sobre a entrega.";
  if (d.length < 11) return `O celular está incompleto: você digitou ${d.length} número(s), são 11 (DDD + 9 dígitos). Exemplo: (11) 98765-4321`;
  if (d.length > 11) return "O celular tem números a mais. Digite só o DDD e o número, sem o +55. Exemplo: (11) 98765-4321";
  if (d[0] === "0" || d[1] === "0") return `O DDD "${d.slice(0, 2)}" não existe. Digite o DDD sem o zero na frente. Exemplo: (11) 98765-4321`;
  if (d[2] !== "9") return "Esse número parece ser de telefone fixo. Informe um celular: depois do DDD ele começa com 9. Exemplo: (11) 98765-4321";
  return null;
}

export function cpfProblem(raw: string): string | null {
  const d = raw.replace(/\D/g, "");
  if (!d) return "Digite o seu CPF. Ele é necessário para a transportadora entregar o pedido.";
  if (d.length < 11) return `O CPF está incompleto: você digitou ${d.length} número(s), são 11.`;
  if (!validCPF(d)) return "Esse CPF não existe. Confira os números digitados: um número trocado já invalida o CPF.";
  return null;
}

export function nameProblem(raw: string): string | null {
  const v = raw.trim();
  if (!v) return "Digite o seu nome completo.";
  if (v.split(/\s+/).length < 2) return `Digite nome e sobrenome (você digitou só "${v}"). Ele vai na etiqueta de entrega.`;
  return null;
}

/** Primeiro problema da etapa 1, na ordem dos campos na tela. `keepCpf`: carrinho retomado com o CPF já gravado. */
export function dadosProblem(data: FormData, keepCpf: boolean): Problem | null {
  const name = nameProblem(data.name);
  if (name) return { field: "name", title: "Confira o seu nome", message: name };
  const email = emailProblem(data.email);
  if (email) return { field: "email", title: "Confira o seu e-mail", message: email };
  const phone = phoneProblem(data.phone);
  if (phone) return { field: "phone", title: "Confira o seu celular", message: phone };
  const cpf = keepCpf && !data.cpf ? null : cpfProblem(data.cpf);
  if (cpf) return { field: "cpf", title: "Confira o seu CPF", message: cpf };
  return null;
}

const KEYS: FieldKey[] = ["name", "email", "phone", "cpf", "cep", "street", "number", "extra", "district", "city", "state", "recipient"];
const TITLE: Partial<Record<FieldKey, string>> = {
  name: "Confira o seu nome",
  email: "Confira o seu e-mail",
  phone: "Confira o seu celular",
  cpf: "Confira o seu CPF",
  cep: "Confira o CEP",
  recipient: "Confira quem vai receber",
};
const FALLBACK: Partial<Record<FieldKey, string>> = {
  email: "O e-mail não foi aceito. Confira se está completo e sem acento, como nome@gmail.com",
  phone: "O celular não foi aceito. Digite DDD + 9 dígitos, como (11) 98765-4321",
  cpf: "O CPF não foi aceito. Confira os 11 números.",
  name: "O nome não foi aceito. Digite nome e sobrenome, sem números.",
  cep: "O CEP não foi aceito. Digite os 8 números do CEP.",
  street: "Confira o endereço (rua ou avenida).",
  number: "Confira o número. Se não houver, escreva S/N.",
  district: "Confira o bairro.",
  city: "Confira a cidade.",
  state: "Confira o estado.",
  recipient: "Confira o nome de quem vai receber (nome e sobrenome).",
};

/**
 * Erro devolvido pelo servidor (POST /api/checkout/cart) → campo da tela + texto claro. O servidor manda o caminho
 * do campo (`customer.email`, `address.cep`); "Campo inválido: customer.email." não diz nada ao cliente.
 */
export function serverProblem(error: string, field: string | undefined): { field: FieldKey | null; title: string; message: string } {
  const key = (field ?? "").split(".").pop() ?? "";
  const k = (KEYS as string[]).includes(key) ? (key as FieldKey) : null;
  const generic = !error || /^Campo (inválido|não reconhecido)/.test(error) || error === "Dados inválidos.";
  const message = k && generic ? (FALLBACK[k] ?? error) : error || "Não foi possível continuar. Tente de novo em instantes.";
  return { field: k, title: (k && TITLE[k]) || "Não foi possível continuar", message };
}
