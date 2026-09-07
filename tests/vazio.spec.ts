import { test, expect } from "@playwright/test";
import { DEMO } from "./helpers";

/**
 * O vazio que primeiro finge estar cheio.
 *
 * O Lucas descreveu assim: "flica parecendo que tem informação e dps some". E
 * não é o esqueleto piscando -- é a TELA CHEIA aparecendo por uns 250ms:
 * quatro indicadores rotulados, barra de filtros e abas, tudo sumindo depois
 * para virar um cartão de "nenhum registro ainda".
 *
 * A causa era um ternário com dois estados para três situações: como
 * `firstRun` exige `!loading`, o tempo de carregar caía no ramo da tela cheia.
 *
 * ISTO NÃO SE MEDE COM ÁRVORE DE ACESSIBILIDADE NEM COM CÓDIGO DE RESPOSTA:
 * as duas são fotos do estado final, e o piscar não aparece em nenhuma. Uma
 * varredura de dez telas concluiu "nenhuma mente sem dado" e estava certa para
 * o que mediu. Aqui a medição é QUADRO A QUADRO.
 */
const CONTA = {
  email: process.env.NONIA_LOGIN ?? DEMO.email,
  password: process.env.NONIA_SENHA ?? DEMO.password,
};

/** As listagens que têm cartão de "ainda não há nada", com o indicador de cada. */
const LISTAGENS = [
  { rota: "/membros", indicadores: ".member-stats" },
  { rota: "/visitantes", indicadores: ".visitor-stats" },
  { rota: "/financeiro", indicadores: ".finance-stats" },
  { rota: "/ministerios", indicadores: ".ministry-stats" },
];

test.describe("o estado vazio não pode fingir estar cheio", () => {
  for (const { rota, indicadores } of LISTAGENS) {
    test(`${rota} não mostra a tela cheia antes de saber que está vazia`, async ({ page }) => {
      const resposta = await page.request.post("/api/auth/login", { data: CONTA });
      expect(resposta.ok(), `login falhou: ${resposta.status()}`).toBe(true);

      await page.goto("/painel");
      await page.waitForLoadState("networkidle");

      // Grava um quadro por frame. Instalado ANTES do clique, porque o que
      // interessa acontece nos primeiros 300ms da navegação.
      await page.evaluate((seletor) => {
        (window as unknown as { __viu: boolean[] }).__viu = [];
        const olhar = () => {
          (window as unknown as { __viu: boolean[] }).__viu.push(
            document.querySelector(seletor) !== null || document.querySelector(".member-filters") !== null,
          );
          requestAnimationFrame(olhar);
        };
        requestAnimationFrame(olhar);
      }, indicadores);

      await page.click(`a[href="${rota}"]`);
      await page.waitForTimeout(2500);

      const vazia = await page.locator(".first-run").count();
      test.skip(vazia === 0, `${rota} tem registro neste banco; o teste é sobre a listagem vazia`);

      const quadros = await page.evaluate(() => (window as unknown as { __viu: boolean[] }).__viu);
      const comTelaCheia = quadros.filter(Boolean).length;
      expect(
        comTelaCheia,
        `${rota} desenhou indicadores/filtros em ${comTelaCheia} quadros antes de virar o cartão de vazio`,
      ).toBe(0);
    });
  }
});
