import { test, expect } from "@playwright/test";
import { CONTA } from "./helpers";

/**
 * A documentação é UMA, lida por duas telas.
 *
 * A /faq pública e a /ajuda de dentro do app saem do mesmo módulo. Se alguém
 * copiar o conteúdo para "ajustar só um pouco" numa delas, a igreja passa a
 * ter duas verdades sobre o próprio produto -- o mesmo motivo pelo qual a
 * listagem e a exportação tiram o filtro do mesmo lugar.
 *
 * Este teste compara os TÍTULOS das duas, que é o que denuncia a cópia.
 */
test.describe("documentação", () => {
  test("a /ajuda e a /faq contam a mesma coisa", async ({ page }) => {
    await page.goto("/faq");
    await page.waitForLoadState("networkidle");
    const publicos = await page.locator(".mk-topic h2").allInnerTexts();
    expect(publicos.length, "a /faq não listou assunto nenhum").toBeGreaterThan(0);

    const resposta = await page.request.post("/api/auth/login", { data: CONTA });
    expect(resposta.ok(), `login falhou: ${resposta.status()}`).toBe(true);
    await page.goto("/ajuda");
    await page.waitForLoadState("networkidle");
    const internos = await page.locator(".ajuda-topico h2").allInnerTexts();

    expect(internos, "os assuntos das duas telas divergiram").toEqual(publicos);
  });

  /**
   * Quem já entrou não pode ser mandado para o site público -- lá a página
   * oferece "Criar conta da igreja" para quem já tem conta.
   */
  test("a documentação do app não sai do painel", async ({ page }) => {
    const resposta = await page.request.post("/api/auth/login", { data: CONTA });
    expect(resposta.ok()).toBe(true);
    await page.goto("/painel");
    await page.waitForLoadState("networkidle");

    const atalho = page.locator(".sidebar-promo");
    await expect(atalho).toHaveAttribute("href", "/ajuda");
    await atalho.click();

    await expect(page).toHaveURL(/\/ajuda$/);
    // Continua dentro do shell: barra do topo e barra lateral no lugar.
    await expect(page.locator(".topbar")).toBeVisible();
    expect(await page.locator('[class^="mk-"]').count(), "chrome de marketing vazou para dentro do app").toBe(0);
  });

  /**
   * Trocar o rótulo da barra lateral de "Fale com a gente" para
   * "Documentação" tirou do app o ÚNICO caminho humano que existia. Ele não
   * some: desce para dentro da própria documentação, que é onde está quem não
   * achou a resposta.
   */
  test("o caminho para falar com gente continua existindo", async ({ page }) => {
    const resposta = await page.request.post("/api/auth/login", { data: CONTA });
    expect(resposta.ok()).toBe(true);
    await page.goto("/ajuda");
    await page.waitForLoadState("networkidle");

    const contato = page.locator('.ajuda-contato a[href^="mailto:"]');
    await expect(contato).toBeVisible();
    await expect(contato).toHaveAttribute("href", /suporte@/);
  });
});
