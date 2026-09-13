import { test, expect } from "@playwright/test";
import { CONTA } from "./helpers";

/**
 * TODA faixa da página começa na mesma margem.
 *
 * Este arquivo existe por um defeito que 32 medições não acharam. O
 * `main > *` limita a largura em 1560px e centraliza com `margin-inline: auto`;
 * a faixa de indicadores usava o ATALHO `margin: 0 0 X`, que zera junto a
 * margem horizontal e derruba a centralização.
 *
 * Abaixo de 1560px de área útil nada centraliza, os dois arranjos coincidem e o
 * desvio é ZERO -- então medir em 1440, 1180, 1050, 900, 800, 640 e 390 não
 * podia mostrar nada. Em 1850px com a barra recolhida, o cabeçalho ia para 183
 * e a faixa ficava em 100: 83px de diferença, só em tela larga.
 *
 * POR ISSO A LARGURA AQUI É GRANDE DE PROPÓSITO. Baixar estes números para
 * 1440 faz o teste passar sempre e não medir nada.
 */
const LARGURAS = [1850, 1920];
const TELAS = ["/membros", "/visitantes", "/ministerios", "/financeiro"];

test.describe("as faixas da página compartilham a margem", () => {
  test.beforeEach(async ({ page }) => {
    const resposta = await page.request.post("/api/auth/login", { data: CONTA });
    expect(resposta.ok(), `login falhou: ${resposta.status()}`).toBe(true);
  });

  for (const rota of TELAS) {
    test(`${rota} alinha as faixas em tela larga, com a barra recolhida`, async ({ page }) => {
      for (const largura of LARGURAS) {
        await page.setViewportSize({ width: largura, height: 950 });
        await page.goto(rota);
        await page.waitForLoadState("networkidle");
        await page.waitForTimeout(1200);

        // Recolhida é o pior caso: sobra mais largura, então a página
        // centraliza mais e a faixa que não centraliza fica mais longe.
        await page.evaluate(() => (document.querySelector("#sidebar-collapse") as HTMLElement | null)?.click());
        await page.waitForTimeout(700);

        const faixas = await page.evaluate(() => {
          const main = document.querySelector("main");
          if (!main) return [];
          return [...main.children]
            .filter((f) => { const r = f.getBoundingClientRect(); return r.width > 80 && r.height > 8; })
            .map((f) => ({ cls: String(f.className).split(" ")[0] || f.tagName, x: Math.round(f.getBoundingClientRect().left) }));
        });

        test.skip(faixas.length < 2, `${rota} não tem duas faixas para comparar neste banco`);

        const bordas = [...new Set(faixas.map((f) => f.x))];
        expect(
          bordas.length,
          `em ${largura}px as faixas começam em x diferentes: ` +
            faixas.map((f) => `${f.cls}=${f.x}`).join(", "),
        ).toBe(1);
      }
    });
  }
});
