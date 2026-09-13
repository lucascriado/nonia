import { test, expect } from "@playwright/test";
import { APP_SCREENS, PUBLIC_SCREENS, horizontalOverflow, login, smallTouchTargets, textOverText, waitForSettled } from "./helpers";

/**
 * Regressão de layout renderizado.
 *
 * Cada asserção aqui corresponde a um defeito que já aconteceu neste projeto:
 * o valor impresso sobre o rótulo no cartão de indicador, botões de 28 a 34px
 * onde o dedo erra, e a grade de mês forçando rolagem lateral no celular.
 * São asserções sobre FORMA, nunca sobre conteúdo — quantos membros existem no
 * banco não é problema do teste.
 */
/**
 * `touch` marca onde a regra de 44px vale. Ela é deliberadamente só de
 * celular: no desktop o ponteiro é fino e a densidade menor é intencional —
 * exigir 44px lá reprovaria o desenho aprovado, não um defeito.
 */
const VIEWPORTS = [
  { name: "celular 390", width: 390, height: 844, touch: true },
  { name: "celular 360", width: 360, height: 640, touch: true },
  { name: "desktop 1440", width: 1440, height: 900, touch: false },
];

for (const viewport of VIEWPORTS) {
  test.describe(`${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    for (const path of PUBLIC_SCREENS) {
      test(`público ${path}`, async ({ page }) => {
        await page.goto(path);
        await waitForSettled(page);

        expect(await textOverText(page), "texto sobre texto").toEqual([]);
        expect(await horizontalOverflow(page), "rolagem lateral").toBeNull();
        if (viewport.touch) expect(await smallTouchTargets(page), "alvo abaixo de 44px").toEqual([]);
      });
    }

    for (const path of APP_SCREENS) {
      test(`app ${path}`, async ({ page }) => {
        await login(page);
        await page.goto(path);
        await waitForSettled(page);

        expect(await textOverText(page), "texto sobre texto").toEqual([]);
        expect(await horizontalOverflow(page), "rolagem lateral").toBeNull();
        if (viewport.touch) expect(await smallTouchTargets(page), "alvo abaixo de 44px").toEqual([]);
      });
    }
  });
}
