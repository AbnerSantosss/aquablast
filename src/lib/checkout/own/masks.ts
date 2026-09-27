/**
 * Máscaras e validações do checkout (Fase 4.3). Arquivo puro: serve no cliente e no servidor.
 * `money`, `validCPF`, `maskPhone`, `maskCPF`, `maskCEP`, `validMobile` foram copiados de ORIGEM/lib/checkout.ts
 * sem alterar a lógica. `onlyDigits`, `validLuhn`, `validCardExpiry`, `cardBrandOf` e `cardLast4` são
 * complementos para a validação do cartão no servidor (Fase 6/7); nunca gravam nem logam nada.
 */

export const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function validCPF(input: string) {
  const n = input.replace(/\D/g, "");
  if (!/^\d{11}$/.test(n) || /^(\d)\1{10}$/.test(n)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(n[i]) * (t + 1 - i);
    const d = (s * 10) % 11;
    if ((d === 10 ? 0 : d) !== Number(n[t])) return false;
  }
  return true;
}

const digits = (value: string, max: number) => value.replace(/\D/g, "").slice(0, max);

export function maskPhone(value: string) {
  const d = digits(value, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const split = d.length > 10 ? 7 : 6;
  return d.length <= split ? `(${d.slice(0, 2)}) ${d.slice(2)}` : `(${d.slice(0, 2)}) ${d.slice(2, split)}-${d.slice(split)}`;
}

export function maskCPF(value: string) {
  const d = digits(value, 11);
  return d.replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d)/, "$1.$2").replace(/(\d{3})(\d{1,2})$/, "$1-$2");
}

export function maskCEP(value: string) {
  const d = digits(value, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export const validMobile = (value: string) => /^[1-9]{2}9\d{8}$/.test(value.replace(/\D/g, ""));

/** Só os dígitos de qualquer texto (CPF, CEP, telefone, número do cartão). */
export const onlyDigits = (value: string) => value.replace(/\D/g, "");

/** Algoritmo de Luhn (mesma regra de ORIGEM/app/simulated-payment.tsx). Exige 13+ dígitos. */
export function validLuhn(cardNumber: string): boolean {
  const d = onlyDigits(cardNumber);
  let s = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    s += n;
  }
  return d.length >= 13 && s % 10 === 0;
}

/** Mês/ano (4 dígitos) no futuro ou no mês corrente. */
export function validCardExpiry(expMonth: number, expYear: number, now: Date = new Date()): boolean {
  if (!Number.isInteger(expMonth) || !Number.isInteger(expYear) || expMonth < 1 || expMonth > 12) return false;
  return new Date(expYear, expMonth, 1) > new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Bandeira pelo BIN (mesma tabela de ORIGEM). Devolve "" quando não reconhece. */
export function cardBrandOf(cardNumber: string): string {
  const d = onlyDigits(cardNumber);
  if (/^3[47]/.test(d)) return "Amex";
  if (/^(401178|401179|431274|438935|451416|457393|457631|457632|504175|506699|5067|509|627780|636297|636368|650|6516|6550)/.test(d)) return "Elo";
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/.test(d)) return "Mastercard";
  if (/^4/.test(d)) return "Visa";
  return "";
}

/** Últimos 4 dígitos: a ÚNICA parte do número do cartão que pode ser gravada (payment_attempts.cardLast4). */
export const cardLast4 = (cardNumber: string) => onlyDigits(cardNumber).slice(-4);
