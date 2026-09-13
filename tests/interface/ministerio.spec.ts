import { test, expect } from "@playwright/test";
import { CONTA } from "./helpers";

/**
 * Criar ministério é uma CONVERSA em passos, e escolher gente é um SELETOR de
 * cartões -- não mais um <select> de adivinhar o nome nem uma parede de caixas.
 *
 * Decisão do Lucas que REVERTE a anterior ("criar não pede gente"): agora a
 * criação pergunta nome, depois líder, depois equipe, e o mesmo seletor serve
 * para os dois. Quem já tem compromisso em outro ministério aparece em cinza --
 * isso depende de /api/members?compromissos=1, que é do backend; aqui medimos o
 * que a tela faz sem depender do dado (passos, busca, paginação, aviso).
 *
 * NENHUM teste aqui salva. Abrir e mexer não grava nada; o banco pode ser
 * compartilhado.
 */
test.describe("ministério: criação em passos e seletor de pessoas", () => {
  test.beforeEach(async ({ page }) => {
    const resposta = await page.request.post("/api/auth/login", { data: CONTA });
    expect(resposta.ok(), `login falhou: ${resposta.status()}`).toBe(true);
    await page.goto("/ministerios");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
  });

  test("a criação é guiada em passos, só o nome trava o avanço, e cabe na tela", async ({ page }) => {
    const novo = page.locator("button", { hasText: "Novo Ministério" });
    test.skip(!(await novo.count()), "sem permissão de escrita nesta conta");
    await novo.click();
    await page.waitForSelector(".ministry-wizard");

    const wizard = page.locator(".ministry-wizard");
    await expect(wizard).toBeVisible();
    // Três passos: Nome, Líder, Equipe.
    await expect(wizard.locator(".wizard-passos li")).toHaveCount(3);

    // Sem nome, não avança: o botão primário fica desabilitado.
    const primario = wizard.locator("footer button.primary-action");
    await expect(primario).toBeDisabled();

    await wizard.locator(".wizard-campo-nome input").fill("Equipe de Teste");
    await expect(primario).toBeEnabled();

    // Passo 1 -> 2: aparece o seletor de líder.
    await primario.click();
    await page.waitForSelector(".mpk-card");
    await expect(wizard.locator(".wizard-pergunta h3")).toContainText("liderar");

    // Passo 2 -> 3: aparece o seletor de equipe e o botão vira "Criar".
    await primario.click();
    await page.waitForSelector(".mpk-card");
    await expect(wizard.locator(".wizard-pergunta h3")).toContainText("equipe");
    await expect(primario).toContainText("Criar");

    // O formulário cabe na janela -- foi um formulário de 911px que motivou tudo.
    const altura = await wizard.evaluate((e) => Math.round(e.getBoundingClientRect().height));
    const janela = await page.evaluate(() => window.innerHeight);
    expect(altura, `o formulário tem ${altura}px numa janela de ${janela}px`).toBeLessThanOrEqual(janela);
    // Sai sem criar: esta suíte não grava.
  });

  test("o seletor mostra cerca de três por página e a busca reduz a lista", async ({ page }) => {
    const novo = page.locator("button", { hasText: "Novo Ministério" });
    test.skip(!(await novo.count()), "sem permissão de escrita nesta conta");
    await novo.click();
    await page.waitForSelector(".ministry-wizard");
    await page.locator(".wizard-campo-nome input").fill("Equipe de Teste");
    await page.locator("footer button.primary-action").click();
    await page.waitForSelector(".mpk-card");

    // Cerca de três nomes por página: nunca mais que isso de uma vez.
    const naPagina = await page.locator(".mpk-card").count();
    expect(naPagina, `a página trouxe ${naPagina} cartões`).toBeLessThanOrEqual(3);

    // Uma busca que não casa com ninguém esvazia a lista com uma mensagem, em
    // vez de mostrar a página anterior.
    await page.locator(".mpk-busca input").fill("zzzznaoexistequalquer");
    await page.waitForTimeout(300);
    expect(await page.locator(".mpk-card").count()).toBe(0);
    await expect(page.locator(".mpk-vazio")).toBeVisible();
  });

  /**
   * A interação mudou e o contrato não: a associação continua indo no mesmo PUT.
   * Quem inclui alguém e fecha sem salvar acha que incluiu, então a tela diz
   * isso ANTES -- e o aviso some quando a mudança é desfeita.
   */
  test("na edição, mexer na equipe avisa que só vale depois de salvar", async ({ page }) => {
    const cartao = page.locator(".resource-card").first();
    test.skip(!(await cartao.count()), "não há ministério neste banco");
    const editar = cartao.locator("button", { hasText: "Editar" }).first();
    test.skip(!(await editar.count()), "sem permissão de edição nesta conta");
    await editar.click();
    await page.waitForSelector(".ministry-resource-dialog:not(.ministry-wizard) .mpk-card");

    // Dois seletores: líder (rádio) e membros (caixas).
    await expect(page.locator(".mpk")).toHaveCount(2);

    const aviso = page.locator(".equipe-pendente");
    await expect(aviso).toHaveCount(0);

    // Alterna uma pessoa no seletor de MEMBROS (cartões com role=checkbox).
    const membro = page.locator(".mpk-card[role=checkbox]").first();
    test.skip(!(await membro.count()), "sem membros para alternar neste banco");
    await membro.click();
    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText("Salvar");

    // Desfaz: volta ao estado salvo e o aviso some com ele.
    await membro.click();
    await expect(aviso).toHaveCount(0);
    // Sai sem salvar: esta suíte não grava.
  });

  /** A lupa da busca não pode ser desenhada sobre a primeira letra digitada. */
  test("a lupa da busca não fica sobre o texto", async ({ page }) => {
    const novo = page.locator("button", { hasText: "Novo Ministério" });
    test.skip(!(await novo.count()), "sem permissão de escrita nesta conta");
    await novo.click();
    await page.waitForSelector(".ministry-wizard");
    await page.locator(".wizard-campo-nome input").fill("Equipe de Teste");
    await page.locator("footer button.primary-action").click();
    await page.waitForSelector(".mpk-busca input");

    const medida = await page.locator(".mpk-busca input").evaluate((el) => {
      const campo = el.getBoundingClientRect();
      const lupa = el.parentElement!.querySelector("svg")!.getBoundingClientRect();
      return {
        textoComecaEm: campo.left + parseFloat(getComputedStyle(el).paddingLeft),
        lupaTerminaEm: lupa.right,
      };
    });
    expect(
      medida.textoComecaEm,
      `o texto começa em ${Math.round(medida.textoComecaEm)} e a lupa termina em ${Math.round(medida.lupaTerminaEm)}`,
    ).toBeGreaterThanOrEqual(medida.lupaTerminaEm);
  });
});
