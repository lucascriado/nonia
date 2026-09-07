import { Skeleton } from "@/components/skeleton";

/**
 * "AINDA NÃO SEI", que é um estado diferente de "não tem nada".
 *
 * A listagem tinha dois estados e três situações. O ternário era
 * `carregando ? ... : temNada ? <FirstRun/> : <telaCheia/>`, e como `temNada`
 * exige `!loading`, o tempo de carregar caía no ramo da TELA CHEIA: por uns
 * 250ms apareciam os quatro indicadores rotulados, a barra de filtros e as
 * abas, e depois tudo aquilo sumia e virava um cartão de "nenhum registro".
 *
 * O Lucas descreveu exatamente isso: "flica parecendo que tem informação e
 * depois some". E é pior que um esqueleto piscando -- rótulo de indicador e
 * barra de filtro se leem como interface de verdade, então a tela afirma ter
 * uma forma que ela ainda não sabe se tem.
 *
 * Este bloco não afirma nada: não tem número, não tem rótulo de filtro, não
 * tem cabeçalho de tabela e não diz quantas linhas virão. Ocupa a mesma área
 * do `FirstRun` para a troca não empurrar a página.
 */
export function FirstLoad({ label }: { label: string }) {
  return (
    <section aria-busy aria-label={label} className="first-load">
      <Skeleton className="first-load-mark" />
      <Skeleton className="first-load-title" />
      <Skeleton className="first-load-line" />
      <Skeleton className="first-load-line is-short" />
    </section>
  );
}
