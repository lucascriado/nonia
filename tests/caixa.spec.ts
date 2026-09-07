import { test, expect } from "@playwright/test";
import { horizontalOverflow, login, smallTouchTargets, textOverText, waitForSettled } from "./helpers";

/**
 * A caixa de entrada do WhatsApp.
 *
 * NENHUM teste aqui envia mensagem, e a regra é mais forte que a do resto da
 * suíte. Lá o motivo é o banco compartilhado; aqui, enviar sairia da máquina:
 * uma mensagem em nome da igreja para o número de alguém não se desfaz. Por
 * isso o campo de resposta é medido como FORMA — existe, está habilitado, tem
 * alvo de toque — e nunca acionado.
 *
 * O que os testes afirmam é forma e coerência com a API, nunca quantidade:
 * o `nonia_dev` pode ter zero conversas hoje e duzentas amanhã.
 */
test.describe("caixa de entrada do WhatsApp", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const AUSENCIA = "Nenhuma conversa neste número ainda.";

  /**
   * O vazio que mente, medido no INSTANTE.
   *
   * `toHaveCount(0)` não serve: ela reexecuta por 5 segundos e passa assim que
   * a lista chega, mesmo que a frase tenha piscado antes. Foi exatamente esse
   * o defeito das listagens — a tela dizia "não tem nada" durante a leitura.
   * Contar uma vez só é o que distingue "nunca apareceu" de "sumiu depois".
   */
  test("o vazio não aparece enquanto a primeira leitura ainda corre", async ({ page }) => {
    await page.goto("/whatsapp");
    // Sem espera nenhuma de propósito: é o intervalo entre pintar a tela e a
    // resposta chegar que interessa.
    const cedo = await page.getByText(AUSENCIA).count();
    expect(cedo, "a frase de ausência apareceu antes de a leitura terminar").toBe(0);
  });

  /**
   * "Nenhuma conversa" é a única frase que AFIRMA ausência, e ela só pode
   * valer com a sincronização terminada. Enquanto o servidor ainda traz
   * conversas, a tela mostra progresso com denominador — nunca a negativa.
   */
  test("a ausência só é afirmada com a sincronização terminada", async ({ page }) => {
    const resposta = await page.request.get("/api/whatsapp/conversas?pageSize=1");
    test.skip(!resposta.ok(), `a rota de conversas respondeu ${resposta.status()}`);
    const { sync, total } = await resposta.json();

    await page.goto("/whatsapp");
    await waitForSettled(page);

    const afirmaAusencia = await page.getByText(AUSENCIA).count();
    if (sync.state === "idle" && total === 0) {
      expect(afirmaAusencia, "sincronizado e sem conversa: a tela deve dizer isso").toBe(1);
    } else {
      expect(
        afirmaAusencia,
        `sync=${sync.state} total=${total}: a tela não pode afirmar que não há conversa`,
      ).toBe(0);
    }
  });

  /**
   * Progresso sem denominador é uma ampulheta. Se o servidor diz que ainda
   * está trazendo, a tela tem de dizer QUANTAS de quantas.
   */
  test("sincronizando, o progresso vem com denominador", async ({ page }) => {
    const resposta = await page.request.get("/api/whatsapp/conversas?pageSize=1");
    test.skip(!resposta.ok(), `a rota de conversas respondeu ${resposta.status()}`);
    const { sync, total } = await resposta.json();
    test.skip(sync.state !== "syncing" || total > 0, "só vale com a caixa ainda enchendo e nada para mostrar");

    await page.goto("/whatsapp");
    await waitForSettled(page);
    await expect(page.getByText(`${sync.chatsSincronizados} de ${sync.chatsConhecidos}`)).toBeVisible();
  });

  /**
   * Mídia vira marcador de TEXTO entre colchetes. O pedido do Lucas é
   * literal — nada de ícone colorido —, e a prévia já vem calculada do
   * servidor: se algum dia a tela ganhar uma tabela de tipos própria, as duas
   * divergem e esta asserção é a que percebe.
   */
  test("mídia é marcador de texto, nunca ícone", async ({ page }) => {
    const resposta = await page.request.get("/api/whatsapp/conversas?pageSize=100");
    test.skip(!resposta.ok(), `a rota de conversas respondeu ${resposta.status()}`);
    const { records } = await resposta.json();
    const comMidia = records.find((c: { preview: string | null }) => /^\[[^\]]+\]/.test(c.preview ?? ""));
    test.skip(!comMidia, "o banco não tem nenhuma conversa cuja última mensagem seja mídia");

    await page.goto("/whatsapp");
    await waitForSettled(page);
    const linha = page.locator(".wa-conversation", { hasText: comMidia.preview.slice(0, 20) }).first();
    await expect(linha).toContainText("[");
    // O marcador é texto do próprio item, e não um <svg> disfarçado de rótulo.
    expect(await linha.locator(".wa-conversation-preview svg").count()).toBe(0);
  });

  /**
   * As duas colunas não cabem em 390px. Ou a lista, ou a conversa — nunca as
   * duas espremidas, que é como uma delas fica com 90px de largura útil.
   */
  test("no celular, lista e conversa não dividem a tela", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/whatsapp");
    await waitForSettled(page);

    const caixa = page.locator(".wa-inbox");
    test.skip(!(await caixa.count()), "a aba não está mostrando a caixa (sem permissão de leitura?)");

    const lista = await caixa.locator(".wa-list").isVisible();
    const conversa = await caixa.locator(".wa-pane").isVisible();
    expect(lista && conversa, "as duas colunas estão visíveis ao mesmo tempo em 390px").toBe(false);

    expect(await horizontalOverflow(page)).toBeNull();
  });

  /** As regras de geometria da casa valem aqui como em qualquer outra tela. */
  test("a aba respeita geometria, sobreposição e alvo de toque", async ({ page }) => {
    for (const largura of [390, 1280]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/whatsapp");
      await waitForSettled(page);

      expect(await horizontalOverflow(page), `rolagem lateral em ${largura}px`).toBeNull();
      expect(await textOverText(page), `texto sobre texto em ${largura}px`).toEqual([]);
      expect(await smallTouchTargets(page), `alvo pequeno em ${largura}px`).toEqual([]);
    }
  });
});
