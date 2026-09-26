"use client";

import { useId, useState, type ComponentPropsWithRef, type PointerEvent, type MouseEvent } from "react";
import { flushSync } from "react-dom";
import { Eye, EyeOff } from "lucide-react";

type PasswordInputProps = Omit<ComponentPropsWithRef<"input">, "type">;

/**
 * Clique com mouse/toque no olho não tira o foco do campo. Só isso: a posição do cursor é
 * guardada e devolvida em toggle(), porque o navegador zera a seleção quando o `type` troca.
 */
function keepFocus(e: PointerEvent<HTMLButtonElement> | MouseEvent<HTMLButtonElement>) {
  e.preventDefault();
}

/**
 * Campo de senha com o botão de olho (mostrar/ocultar) dentro do campo, à direita.
 * Aceita todas as props de <input> menos `type`, inclusive `ref` (React 19): funciona com
 * `{...register("campo")}` do react-hook-form e solto numa página servidor.
 *
 * Use com <label htmlFor={id}> (não envolva num <label>: o nome acessível do campo
 * levaria junto o "Mostrar senha" do botão).
 */
export function PasswordInput({ id, className, ...props }: PasswordInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const [visible, setVisible] = useState(false);

  /**
   * Alterna mostrar/ocultar sem mandar o cursor para o começo: trocar o `type` do input faz o
   * Chrome zerar a seleção. Se o campo está focado (clique com mouse/toque, que keepFocus mantém
   * no campo), guarda a seleção, aplica o novo `type` na hora (flushSync) e devolve a seleção.
   * Se o foco está no botão (acionado pelo teclado), só alterna: não puxa o foco de volta.
   * O input é achado pelo id para não mexer no `ref` que vem por props (react-hook-form).
   */
  function toggle() {
    const input = document.getElementById(inputId);
    if (!(input instanceof HTMLInputElement) || document.activeElement !== input) {
      setVisible((v) => !v);
      return;
    }
    const { selectionStart, selectionEnd, selectionDirection } = input;
    flushSync(() => setVisible((v) => !v));
    if (selectionStart !== null && selectionEnd !== null) {
      input.setSelectionRange(selectionStart, selectionEnd, selectionDirection ?? undefined);
    }
  }

  return (
    <span className="pw-input">
      <input {...props} id={inputId} type={visible ? "text" : "password"} className={className ? `pw-field ${className}` : "pw-field"} />
      <button
        type="button"
        className="pw-toggle"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        aria-controls={inputId}
        title={visible ? "Ocultar senha" : "Mostrar senha"}
        onPointerDown={keepFocus}
        onMouseDown={keepFocus}
        onClick={toggle}
      >
        {visible ? <EyeOff aria-hidden="true" size={20} strokeWidth={2} /> : <Eye aria-hidden="true" size={20} strokeWidth={2} />}
      </button>
    </span>
  );
}
