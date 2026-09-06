import { TriangleAlert } from "lucide-react";

/**
 * Erro que vale para o formulário inteiro (credencial inválida, bloqueio por
 * tentativas). `role="alert"` faz o leitor de tela anunciar assim que aparece.
 */
export function AuthAlert({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <p className="mk-auth-alert" role="alert">
      <TriangleAlert aria-hidden />
      {message}
    </p>
  );
}
