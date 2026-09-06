import { test, expect } from "@playwright/test";
import { login } from "./helpers";

/**
 * Paginação e filtro no servidor.
 *
 * O teste que importa aqui é o do INDICADOR. Quando a listagem virou uma
 * página, os quatro pontos que explodem na hora foram corrigidos no mesmo dia;
 * o quinto — indicador somado a partir da lista — não explode: os números
 * continuam aparecendo e passam a somar a página em vez do total. Ninguém
 * repara até conferir o saldo contra o extrato do banco.
 *
 * Todas as asserções são sobre FORMA. Nenhuma afirma quantos registros existem.
 */
test.describe("listagem paginada", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  /** O cartão de um rótulo, lido como número. Por rótulo e não por posição: a
   *  ordem dos indicadores muda, e teste preso a posição quebra por arrumação. */
  async function indicador(page: import("@playwright/test").Page, rotulo: string) {
    const texto = await page.locator(".member-stats article", { hasText: rotulo }).locator("strong").innerText();
    return Number(texto.replace(/\D/g, ""));
  }

  test("o indicador não pode ser a soma da página", async ({ page }) => {
    const resposta = await page.request.get("/api/members?pageSize=1");
    const { total } = await resposta.json();
    test.skip(total <= 1, "precisa de mais de um registro para distinguir página de total");

    await page.goto("/membros");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);

    const linhasNaPagina = await page.locator(".members-table tbody tr").count();
    const ativos = await indicador(page, "Total ativos");

    // Se o indicador voltar a sair da lista, ele nunca poderá passar do número
    // de linhas da página — é exatamente esse teto que denuncia a regressão.
    expect(linhasNaPagina, "a página não pode conter tudo, senão o teste não distingue").toBeLessThan(total);
    expect(ativos, "indicador maior que a página prova que veio do servidor").toBeGreaterThan(linhasNaPagina);
  });

  /**
   * O outro lado do mesmo defeito, e o que estava vivo até hoje: o indicador
   * vinha do servidor, mas de uma requisição SEPARADA que mandava só o próprio
   * recorte. Com filtro aplicado, a lista obedecia e o número ignorava. Aqui a
   * asserção é de RELAÇÃO, não de valor: filtrar por inativos tem que zerar o
   * indicador de ativos, seja qual for o conteúdo do banco.
   */
  test("o indicador obedece ao filtro da lista", async ({ page }) => {
    const resposta = await page.request.get("/api/members?pageSize=1");
    const { summary } = await resposta.json();
    test.skip(!summary || summary.active === 0, "precisa de algum membro ativo para o filtro ter efeito");

    await page.goto("/membros");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);
    expect(await indicador(page, "Total ativos")).toBe(summary.active);

    // No desktop a gaveta já vem aberta; no celular é preciso abrir.
    const seletor = page.locator('select[aria-label="Filtrar por status"]');
    if (!(await seletor.isVisible())) await page.locator(".filter-disclosure-toggle").first().click();
    await seletor.selectOption("Inativo");
    await page.waitForTimeout(1500);

    expect(await indicador(page, "Total ativos"), "com o filtro em Inativo, nenhum ativo pode sobrar no indicador").toBe(0);
  });

  test("o resumo do financeiro vem do servidor, não da página", async ({ page }) => {
    const resposta = await page.request.get("/api/financeiro?pageSize=1");
    const { summary } = await resposta.json();

    await page.goto("/financeiro");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1200);

    const saldoNaTela = await page.locator(".finance-summary article").first().locator("strong").innerText();
    const digitos = (texto: string) => texto.replace(/\D/g, "");
    expect(digitos(saldoNaTela), "o saldo da tela tem que ser o do summary").toBe(digitos(summary.balance));
  });

  test("a busca encontra quem está fora da primeira página", async ({ page }) => {
    const primeira = await page.request.get("/api/members?pageSize=6&page=1");
    const { records, total } = await primeira.json();
    test.skip(total <= records.length, "precisa de mais de uma página");

    const restante = await page.request.get(`/api/members?pageSize=100&page=1`);
    const todos = (await restante.json()).records as Array<{ name: string }>;
    const nomesDaPrimeira = new Set(records.map((r: { name: string }) => r.name));
    const forasteiro = todos.find((r) => !nomesDaPrimeira.has(r.name));
    test.skip(!forasteiro, "não achei ninguém fora da primeira página");

    await page.goto("/membros");
    await page.waitForLoadState("networkidle");
    await page.getByPlaceholder(/filtrar por nome/i).fill(forasteiro!.name);
    await page.waitForTimeout(900);

    await expect(page.locator(".members-table tbody tr")).toHaveCount(1);
    await expect(page.locator(".members-table tbody tr").first()).toContainText(forasteiro!.name);
  });

  test("trocar filtro volta para a primeira página", async ({ page }) => {
    await page.goto("/membros");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(1000);

    const paginas = page.locator(".members-pagination button").filter({ hasText: /^2$/ });
    test.skip((await paginas.count()) === 0, "precisa de mais de uma página");

    await paginas.first().click();
    await page.waitForTimeout(900);
    await expect(page.locator(".members-pagination")).toContainText(/Mostrando 7-/);

    await page.getByLabel("Filtrar por status").selectOption("Ativo");
    await page.waitForTimeout(900);
    await expect(page.locator(".members-pagination")).toContainText(/Mostrando 1-/);
  });
});
