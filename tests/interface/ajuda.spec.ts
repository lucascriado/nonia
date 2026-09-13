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
   * A marca dentro do app é a mesma do site: ícone e "nonia", sem linha de
   * apoio. Era o app que destoava.
   *
   * E a frase "A sua igreja organizada" NÃO foi apagada do produto: ela é copy
   * que vende e continua no herói da landing, no título da página e na
   * descrição para busca. Apagá-la de lá por causa de um pedido sobre a marca
   * do painel seria obedecer a palavra e trair a intenção -- por isso o teste
   * cobra as duas coisas ao mesmo tempo.
   */
  test("a marca do app não repete a frase de venda, e a landing continua com ela", async ({ page }) => {
    const frase = () =>
      page.evaluate(() => /igreja\s+organizada/i.test(document.body.innerText.replace(/\s+/g, " ")));

    // A LANDING PRIMEIRO, e SEM sessão: com o cookie no lugar, "/" desvia para
    // o painel, e o teste mediria a dashboard achando que mediu a landing.
    await page.goto("/");
    // O herói entra por animação de revelação: medir antes de ele aparecer
    // acusaria a frase de ter sumido quando ela só não tinha chegado.
    await expect(page.locator("h1")).toBeVisible();
    expect(await frase(), "a frase sumiu da landing, onde ela é o que vende").toBe(true);

    const resposta = await page.request.post("/api/auth/login", { data: CONTA });
    expect(resposta.ok()).toBe(true);
    await page.goto("/painel");
    await page.waitForLoadState("networkidle");

    await expect(page.locator(".brand-text")).toHaveText("nonia");
    // A barra lateral vive no shell, então basta uma tela para valer em todas.
    expect(await frase(), "a frase de venda voltou para dentro do painel").toBe(false);
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
