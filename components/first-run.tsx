import type { LucideIcon } from "lucide-react";

/**
 * Tela sem NENHUM registro e sem filtro aplicado.
 *
 * Não é a tela cheia com os dados vazios: indicadores zerados, barra de filtros
 * para filtrar nada, cabeçalho de tabela e "Mostrando 0-0 de 0" ocupam a área
 * nobre para não informar coisa alguma. Quem acabou de criar a igreja precisa
 * de uma frase e de um caminho, e o resto só atrapalha.
 *
 * Isto é diferente de "o filtro não achou nada": lá os filtros ficam, porque a
 * pessoa precisa deles para voltar atrás.
 */
export function FirstRun({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  /** Sem ação quando a conta está em somente leitura ou falta permissão. */
  action?: React.ReactNode;
}) {
  return (
    <section className="first-run">
      <span aria-hidden><Icon /></span>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </section>
  );
}
