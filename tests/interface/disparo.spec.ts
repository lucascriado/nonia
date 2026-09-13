import { test, expect } from "@playwright/test";
import { CONTA } from "./helpers";

/**
 * A tela do disparo, com nomes.
 *
 * NENHUM teste aqui confirma um envio. A conferência para no passo anterior:
 * "Revisar e enviar" abre a confirmação e o teste lê o que ela diz, e nunca
 * clica em "Confirmar envio". Mensagem em nome da igreja para o telefone de
 * alguém não se desfaz, e aqui seriam dezenas de uma vez.
 */
test.describe("quem recebe o disparo", () => {
  test.beforeEach(async ({ page }) => {
    const resposta = await page.request.post("/api/auth/login", { data: CONTA });
    expect(resposta.ok(), `login falhou: ${resposta.status()}`).toBe(true);
  });

  async function abrirDisparo(page: import("@playwright/test").Page) {
    await page.goto("/whatsapp");
    await page.waitForLoadState("networkidle");
    const aba = page.locator(".wa-tabs button", { hasText: "Disparos" });
    test.skip(!(await aba.count()), "esta conta não tem permissão de disparo");
    await aba.click();
    await page.waitForTimeout(2500);
  }

  /**
   * Quem não recebe APARECE, com o porquê. Sumir com a linha esconderia
   * justamente o que precisa de conserto na ficha da pessoa -- e some também a
   * chance de alguém notar que faltou telefone.
   */
  test("quem não recebe aparece na lista, com o motivo e sem caixa que engana", async ({ page }) => {
    await abrirDisparo(page);
    const abrir = page.locator(".wa-alvos-abrir");
    test.skip(!(await abrir.count()), "não há destinatário neste banco");
    await abrir.click();

    const fora = page.locator(".wa-alvos-lista label.is-fora").first();
    test.skip(!(await fora.count()), "neste banco todo mundo do filtro pode receber");

    await expect(fora.locator(".wa-alvos-motivo")).not.toBeEmpty();
    // Caixa que não muda nada é promessa vazia: quem não pode receber não é
    // uma escolha, e a caixa diz isso ficando travada.
    await expect(fora.locator("input")).toBeDisabled();
    await expect(fora.locator("input")).not.toBeChecked();
  });

  /**
   * Desmarcar tem de mudar o que a tela PROMETE, não só o visto: a contagem, a
   * duração e a frase da confirmação saem todas da seleção.
   */
  test("desmarcar muda a contagem e a confirmação", async ({ page }) => {
    await abrirDisparo(page);
    const abrir = page.locator(".wa-alvos-abrir");
    test.skip(!(await abrir.count()), "não há destinatário neste banco");
    await abrir.click();

    const marcaveis = page.locator(".wa-alvos-lista input:not([disabled])");
    const quantos = await marcaveis.count();
    test.skip(quantos < 2, "precisa de pelo menos duas pessoas que possam receber");

    const antes = await abrir.locator("small").innerText();
    await marcaveis.first().uncheck();
    await expect(abrir.locator("small")).not.toHaveText(antes);

    await page.locator(".wa-message textarea").fill("Conferência da suíte, sem enviar.");
    await page.locator("button", { hasText: "Revisar e enviar" }).click();

    const confirmacao = page.locator(".wa-confirm");
    await expect(confirmacao).toBeVisible();
    await expect(confirmacao).toContainText(`${quantos - 1}`);
    // A confirmação precisa DIZER que alguém foi tirado -- senão a pessoa
    // revisa um número menor sem saber por quê.
    await expect(confirmacao).toContainText("desmarcada");

    // Sai sem enviar. Este teste nunca clica em "Confirmar envio".
    await page.locator("button", { hasText: "Voltar" }).click();
    await expect(confirmacao).toHaveCount(0);
  });

  /**
   * O resumo e a lista saem da MESMA leitura. Duas rotas seriam duas
   * resoluções em instantes diferentes, e foi assim que a prévia disse 5 e o
   * envio foi para 6.
   */
  test("o resumo e os nomes vêm da mesma resolução", async ({ page }) => {
    const pedidos: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/api/whatsapp/broadcasts")) pedidos.push(r.url());
    });
    await abrirDisparo(page);
    test.skip(!(await page.locator(".wa-alvos-abrir").count()), "não há destinatário neste banco");

    const destinatarios = pedidos.filter((u) => u.includes("/destinatarios")).length;
    const previas = pedidos.filter((u) => !u.includes("/destinatarios") && !u.includes("page=")).length;
    expect(destinatarios, "a lista de destinatários não foi consultada").toBeGreaterThan(0);
    expect(previas, "ainda há uma segunda rota resolvendo o mesmo recorte").toBe(0);
  });
});
