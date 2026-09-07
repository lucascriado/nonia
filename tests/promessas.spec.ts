import { test, expect } from "@playwright/test";
import { DEMO } from "./helpers";

/**
 * "A tela afirma o que ninguém leu" -- e a irmã dela, a tela que ANUNCIA o
 * que ninguém ligou.
 *
 * O `<kbd>Ctrl K</kbd>` ao lado da busca global existia desde sempre e não
 * havia um único ouvinte de teclado no projeto: o selinho era desenho. Este
 * arquivo é a casa dos testes dessa família -- elemento que promete
 * comportamento tem de ter comportamento por trás.
 */
const CONTA = {
  email: process.env.NONIA_LOGIN ?? DEMO.email,
  password: process.env.NONIA_SENHA ?? DEMO.password,
};

test.describe("o que a interface anuncia, ela faz", () => {
  test.beforeEach(async ({ page }) => {
    const resposta = await page.request.post("/api/auth/login", { data: CONTA });
    expect(resposta.ok(), `login falhou: ${resposta.status()}`).toBe(true);
  });

  test("Ctrl+K abre a busca global, e não só foca nela", async ({ page }) => {
    await page.goto("/painel");
    await page.waitForLoadState("networkidle");

    const resultados = page.locator(".global-search-results a");
    expect(await resultados.count(), "a lista já estava aberta antes do atalho").toBe(0);

    await page.keyboard.press("Control+k");

    await expect(page.locator(".global-search input")).toBeFocused();
    // Focar sem abrir seria meio conserto: a lista só aparece com `focused`,
    // e quem aperta o atalho quer ver os destinos, não um cursor piscando.
    expect(await resultados.count(), "o atalho focou mas não abriu os resultados").toBeGreaterThan(0);
  });

  test("Esc fecha a busca aberta pelo atalho", async ({ page }) => {
    await page.goto("/painel");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("Control+k");
    await expect(page.locator(".global-search input")).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.locator(".global-search input")).not.toBeFocused();
    await expect(page.locator(".global-search-results")).toHaveCount(0);
  });

  /**
   * Ctrl+K dentro de um campo de texto é "apagar até o fim da linha" no Unix.
   * Quem está digitando um nome no filtro não está procurando uma página, e
   * roubar a tecla dali trocaria uma promessa vazia por um atalho intrometido.
   */
  test("Ctrl+K não rouba a tecla de quem está digitando num filtro", async ({ page }) => {
    await page.goto("/membros");
    await page.waitForLoadState("networkidle");
    const filtro = page.locator(".member-filter-search input").first();
    test.skip(!(await filtro.count()), "esta listagem não está mostrando o filtro de busca");

    await filtro.click();
    await page.keyboard.type("maria");
    await page.keyboard.press("Control+k");

    await expect(filtro).toBeFocused();
    await expect(page.locator(".global-search-results")).toHaveCount(0);
  });
});
