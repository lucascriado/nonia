import { test, expect } from "@playwright/test";
import { DEMO, login } from "./helpers";

/**
 * Fluxo mínimo de sessão.
 *
 * O teste de identidade existe por um motivo concreto: quando GET
 * /api/auth/session começou a responder 500 por uma migration não aplicada,
 * typecheck e build passaram e a interface trocou o usuário real pelo
 * placeholder sem avisar. Esta asserção teria pegado.
 */
test.describe("sessão", () => {
  test("página protegida sem sessão vai para /entrar guardando o destino", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/membros");
    await expect(page).toHaveURL(/\/entrar\?redirect=%2Fmembros/);
  });

  test("credencial errada mostra a mensagem do servidor sem apontar o campo", async ({ page }) => {
    await page.context().clearCookies();
    await page.goto("/entrar");

    await page.getByLabel("E-mail", { exact: true }).fill(DEMO.email);
    await page.getByLabel("Senha", { exact: true }).fill("senha-que-nao-e-a-certa");
    await page.getByRole("button", { name: /entrar/i }).click();

    // O erro é do formulário, não de um campo: o servidor responde igual para
    // senha errada e e-mail inexistente, e a tela preserva esse sigilo.
    // O anunciador de rota do Next também tem role="alert"; o alvo é o alerta
    // do formulário.
    const alerta = page.locator(".mk-auth-alert");
    await expect(alerta).toBeVisible();
    await expect(alerta).toContainText(/incorret/i);
    await expect(page.locator(".mk-field-error")).toHaveCount(0);
  });

  test("campo vazio é barrado antes de chamar o servidor", async ({ page }) => {
    await page.context().clearCookies();
    let chamou = false;
    page.on("request", (request) => {
      if (request.url().includes("/api/auth/login")) chamou = true;
    });

    await page.goto("/entrar");
    await page.getByRole("button", { name: /entrar/i }).click();

    await expect(page.locator(".mk-field-error").first()).toBeVisible();
    expect(chamou, "não deve chamar o login com o formulário vazio").toBe(false);
  });

  test("login válido chega no painel com identidade real", async ({ page }) => {
    await login(page);
    await page.goto("/painel");
    await page.waitForLoadState("networkidle");

    // Forma, não conteúdo: não afirmo QUAL é o nome, só que não é o
    // placeholder que aparece quando a sessão não resolve.
    const nome = page.locator(".user strong");
    await expect(nome).toBeVisible();
    await expect(nome).not.toHaveText("Administrador");

    const organizacao = page.locator(".workspace-card strong");
    await expect(organizacao).toBeVisible();
    await expect(organizacao).not.toHaveText("Sua igreja");
  });
});
