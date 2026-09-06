"use client";

import { useId, useState } from "react";
import { Eye, EyeOff } from "lucide-react";

/**
 * Campo de formulário de autenticação. O erro é anunciado por
 * `aria-describedby` e `aria-invalid`, então quem usa leitor de tela ouve o
 * motivo junto do campo em vez de caçar a mensagem na página.
 */
export function AuthField({
  label,
  error,
  hint,
  type = "text",
  ...input
}: {
  label: string;
  error?: string | null;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useId();
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const describedBy = [error ? `${id}-erro` : null, hint ? `${id}-dica` : null].filter(Boolean).join(" ");

  return (
    <div className={`mk-field${error ? " has-error" : ""}`}>
      <label htmlFor={id}>{label}</label>
      <div className="mk-field-input">
        <input
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : undefined}
          id={id}
          type={isPassword && revealed ? "text" : type}
          {...input}
        />
        {isPassword && (
          <button
            aria-label={revealed ? "Ocultar senha" : "Mostrar senha"}
            className="mk-field-reveal"
            onClick={() => setRevealed((value) => !value)}
            tabIndex={-1}
            type="button"
          >
            {revealed ? <EyeOff /> : <Eye />}
          </button>
        )}
      </div>
      {hint && !error && <small id={`${id}-dica`}>{hint}</small>}
      {error && <small className="mk-field-error" id={`${id}-erro`}>{error}</small>}
    </div>
  );
}
