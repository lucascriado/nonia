import { test, expect } from "@playwright/test";
import { CONTA } from "./helpers";

/**
 * A equipe do ministério: busca, não parede de caixas.
 *
 * O formulário tinha 30+ caixas de seleção numa grade rolante e media 911px
 * numa janela de 900 -- não cabia. A alternativa de paginar não resolve: 100
 * pessoas em blocos de 3 são 34 páginas para achar UMA, e quem monta equipe já
 * sabe o nome. Paginação serve para folhear; ninguém folheia para montar time.
 *
 * NENHUM teste aqui salva. Abrir e mexer no formulário não grava nada; o
 * `Salvar` nunca é clicado, porque o banco pode ser compartilhado.
 */
test.describe("equipe do ministério", () => {
  test.beforeEach(async ({ page }) => {
    const resposta = await page.request.post("/api/auth/login", { data: CONTA });
    expect(resposta.ok(), `login falhou: ${resposta.status()}`).toBe(true);
    await page.goto("/ministerios");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
  });

  test("criar ministério não pede para escolher gente, e o formulário cabe na tela", async ({ page }) => {
    const novo = page.locator("button", { hasText: "Novo Ministério" });
    test.skip(!(await novo.count()), "sem permissão de escrita nesta conta");
    await novo.click();
    await page.waitForTimeout(800);

    const form = page.locator(".ministry-resource-dialog");
    await expect(form).toBeVisible();
    // Criar ministério não exige montar a equipe: ela entra depois.
    expect(await form.locator("input[type=checkbox]").count(), "voltaram as caixas de seleção").toBe(0);
    expect(await form.locator(".equipe").count(), "o bloco de equipe apareceu no cadastro").toBe(0);

    const altura = await form.evaluate((e) => Math.round(e.getBoundingClientRect().height));
    const janela = await page.evaluate(() => window.innerHeight);
    expect(altura, `o formulário tem ${altura}px numa janela de ${janela}px`).toBeLessThanOrEqual(janela);
  });

  test("a equipe se monta pela busca, e nada aparece antes de perguntar", async ({ page }) => {
    const cartao = page.locator(".resource-card").first();
    test.skip(!(await cartao.count()), "não há ministério neste banco");
    const editar = cartao.locator("button", { hasText: "Editar" }).first();
    test.skip(!(await editar.count()), "sem permissão de edição nesta conta");
    await editar.click();
    await page.waitForTimeout(1200);

    const equipe = page.locator(".equipe");
    await expect(equipe).toBeVisible();
    // Sugestão sem pergunta é a parede de caixas com outra roupa.
    expect(await equipe.locator(".equipe-sugestoes li").count(), "sugeriu gente sem ninguém ter buscado").toBe(0);

    await equipe.locator(".equipe-busca input").fill("a");
    await page.waitForTimeout(400);
    expect(await equipe.locator(".equipe-sugestoes li").count(), "uma letra só já disparou a lista inteira").toBe(0);

    await equipe.locator(".equipe-busca input").fill("ana");
    await page.waitForTimeout(500);
    const achou = await equipe.locator(".equipe-sugestoes li").count();
    test.skip(achou === 0, "nenhum membro chamado 'ana' neste banco");
    expect(achou, "a busca devolveu gente demais para escolher de relance").toBeLessThanOrEqual(6);
  });

  /**
   * A interação mudou e o contrato não: a associação continua indo no mesmo
   * PUT do ministério. Quem inclui alguém e fecha sem salvar acha que incluiu,
   * então a tela diz isso ANTES -- e o aviso some quando a mudança é desfeita,
   * senão vira ruído que ninguém lê.
   */
  test("incluir alguém avisa que só vale depois de salvar", async ({ page }) => {
    const cartao = page.locator(".resource-card").first();
    test.skip(!(await cartao.count()), "não há ministério neste banco");
    const editar = cartao.locator("button", { hasText: "Editar" }).first();
    test.skip(!(await editar.count()), "sem permissão de edição nesta conta");
    await editar.click();
    await page.waitForTimeout(1200);

    const aviso = page.locator(".equipe-pendente");
    await expect(aviso).toHaveCount(0);

    await page.locator(".equipe-busca input").fill("ana");
    await page.waitForTimeout(500);
    const sugestao = page.locator(".equipe-sugestoes button").first();
    test.skip(!(await sugestao.count()), "nenhum membro 'ana' para incluir neste banco");
    await sugestao.click();

    await expect(aviso).toBeVisible();
    await expect(aviso).toContainText("Salvar");

    // Desfazer devolve ao estado salvo, e o aviso some com ele.
    await page.locator(".equipe-lista button").first().click();
    await expect(aviso).toHaveCount(0);
    // Sai sem salvar: esta suíte não grava.
  });

  /** A lupa não pode ser desenhada sobre a primeira letra. */
  test("a lupa da busca não fica sobre o texto", async ({ page }) => {
    const cartao = page.locator(".resource-card").first();
    test.skip(!(await cartao.count()), "não há ministério neste banco");
    const editar = cartao.locator("button", { hasText: "Editar" }).first();
    test.skip(!(await editar.count()), "sem permissão de edição nesta conta");
    await editar.click();
    await page.waitForTimeout(1200);

    const medida = await page.locator(".equipe-busca input").evaluate((el) => {
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
