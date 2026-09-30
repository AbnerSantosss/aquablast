import type { ReactNode } from "react";
import type { ActionFn } from "@/lib/admin/types";
import type { IntegrationStatusEntry, SecretDescription } from "@/lib/settings";
import { SecretFieldClient, type SecretBadge } from "./SecretFieldClient";

/**
 * Campo de segredo do painel (token, API key, senha SMTP) que NUNCA aparece vazio quando há valor salvo.
 *
 * - Configurado: mostra a máscara de describeSecret() (`EAAB••••••••3f9K`) + selo do status:
 *   verde "Conectado · verificado 30/09 14:32" (só se a última verificação REAL passou) /
 *   vermelho "Falhou: <motivo>" / amarelo "Salvo, não verificado" / cinza "Salvo (sem teste disponível)".
 *   "Trocar" revela o input vazio (SECRET_INPUT); "Cancelar troca" o recolhe de novo.
 * - Não configurado: input vazio + "não configurado".
 *
 * Contrato com o servidor (quem salva):
 * - Sem "Trocar", o input NÃO é renderizado: o campo fica AUSENTE do FormData. A action de salvar tem de
 *   tratar ausente igual a vazio = manter o segredo (`isSecretKey(k) && !v -> continue`, como já fazem
 *   pixels/gateways/settings via str(fd, ...), que devolve "" para ausente).
 * - Segredo novo salvo -> clearIntegrationStatus(key) (lib/admin/integrations/status.ts) e, se der,
 *   verificação real + setIntegrationStatus.
 *
 * Botão "Verificar" DENTRO do <form> de salvar (decisão da etapa A):
 * - Pode (e deve) ficar dentro do ActionForm de salvar: NÃO há <form> aninhado.
 * - O botão é `type="button"` e chama a action com `startTransition(() => dispatch(fd))` de um
 *   `useActionState(verifyAction)` próprio (padrão da doc do Next 16, 01-getting-started/07-mutating-data).
 * - Não usamos `<button formAction>`: seria um botão submit, e Enter num campo do formulário dispararia
 *   o primeiro submit da árvore (o Verificar, se viesse antes do Salvar). Nem `form="<id>"`: exigiria um
 *   <form> separado fora do cartão para cada segredo.
 * - `verifyAction` é uma Server Action `ActionFn` (prev, formData). O FormData enviado tem só
 *   `field` = `name` do campo (a mesma action pode servir vários campos). Ela verifica o valor SALVO
 *   (não o digitado), grava setIntegrationStatus e chama revalidatePath da tela para o selo atualizar.
 *   Enquanto o input de troca está aberto o Verificar some ("salve antes de verificar a chave nova").
 *
 * A data do selo é formatada aqui (servidor, fuso de São Paulo) e vai pronta ao client: nada de relógio
 * relativo no navegador (erro de hidratação, ver wiki/decisoes/armadilhas.md).
 */
export type SecretFieldProps = {
  /** Nome do campo no FormData (a chave do setting, ex.: "ads.meta.accessToken"). */
  name: string;
  label: string;
  /** describeSecret(key) serve direto (só configured e masked vão ao navegador). */
  secret: Pick<SecretDescription, "configured" | "masked">;
  /** Status de getIntegrationStatus(<chave da integração>). */
  status?: IntegrationStatusEntry;
  /** false = a integração não tem teste sem efeito colateral (selo cinza). */
  verifiable: boolean;
  verifyAction?: ActionFn;
  help?: ReactNode;
  placeholder?: string;
  maxLength?: number;
};

const TZ = "America/Sao_Paulo";

/** "30/09 14:32" no fuso da loja. */
export function formatVerifiedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const parts = new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const p = (t: Intl.DateTimeFormatPartTypes) => parts.find((x) => x.type === t)?.value ?? "";
  return `${p("day")}/${p("month")} ${p("hour")}:${p("minute")}`;
}

export function secretBadge(configured: boolean, verifiable: boolean, status?: IntegrationStatusEntry): SecretBadge | null {
  if (!configured) return null;
  if (!verifiable) return { tone: "gray", text: "Salvo (sem teste disponível)" };
  if (!status) return { tone: "orange", text: "Salvo, não verificado" };
  const when = formatVerifiedAt(status.at);
  if (status.ok) {
    return { tone: "green", text: ["Conectado", status.message, when ? `verificado ${when}` : ""].filter(Boolean).join(" · ") };
  }
  return { tone: "red", text: `Falhou: ${status.message || "erro sem detalhe"}${when ? ` · ${when}` : ""}` };
}

export function SecretField({ name, label, secret, status, verifiable, verifyAction, help, placeholder, maxLength = 500 }: SecretFieldProps) {
  return (
    <SecretFieldClient
      name={name}
      label={label}
      configured={secret.configured}
      masked={secret.configured ? secret.masked : ""}
      badge={secretBadge(secret.configured, verifiable, status)}
      canVerify={secret.configured && verifiable && Boolean(verifyAction)}
      verifyAction={verifyAction}
      help={help}
      placeholder={placeholder}
      maxLength={maxLength}
    />
  );
}
