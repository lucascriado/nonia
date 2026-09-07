import { test, expect } from "@playwright/test";
import { CONTA, horizontalOverflow, smallTouchTargets, textOverText, waitForSettled } from "./helpers";

async function entrar(page: import("@playwright/test").Page) {
  const resposta = await page.request.post("/api/auth/login", { data: CONTA });
  if (!resposta.ok()) throw new Error(`login falhou (${CONTA.email}): ${resposta.status()}`);
}

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
    await entrar(page);
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
   * O progresso da sincronização, e as duas armadilhas dele.
   *
   * Ele fica FORA do bloco de vazio: a sincronização continua depois que as
   * primeiras conversas aparecem, e era exatamente aí que ele sumia -- some no
   * instante em que passa a ser útil.
   *
   * Nunca 100% enquanto `state` é `syncing`: o denominador cresce enquanto o
   * servidor descobre conversas, então a conta pode bater 100 e voltar. Barra
   * que chega ao fim e volta é pior que barra nenhuma. Quem anuncia o fim é o
   * `state` virar `idle`, não a divisão.
   */
  test("sincronizando, o progresso aparece com denominador e nunca chega a 100%", async ({ page }) => {
    const resposta = await page.request.get("/api/whatsapp/conversas?pageSize=1");
    test.skip(!resposta.ok(), `a rota de conversas respondeu ${resposta.status()}`);
    const { sync } = await resposta.json();
    test.skip(sync.state !== "syncing", "a caixa deste banco não está sincronizando agora");

    await page.goto("/whatsapp");
    await page.waitForLoadState("networkidle");

    const faixa = page.locator(".wa-sync");
    await expect(faixa).toBeVisible();
    // A fração vem antes: é ela que torna legível o denominador crescendo.
    await expect(faixa).toContainText(" de ");
    await expect(faixa).not.toContainText("100%");

    const largura = await page.locator(".wa-sync-barra > i").evaluate((e) => (e as HTMLElement).style.width);
    expect(largura, "a barra encheu antes de a sincronização terminar").not.toBe("100%");
  });

  /**
   * `never_synced` não é 0%: zero por cento afirma que começou e nada veio, e
   * a verdade é que não começou. São estados diferentes.
   */
  test("nunca sincronizado não vira zero por cento", async ({ page }) => {
    const resposta = await page.request.get("/api/whatsapp/conversas?pageSize=1");
    test.skip(!resposta.ok(), `a rota de conversas respondeu ${resposta.status()}`);
    const { sync, connected } = await resposta.json();
    test.skip(sync.state !== "never_synced" || !connected, "esta caixa já começou a sincronizar");

    await page.goto("/whatsapp");
    await waitForSettled(page);
    const faixa = page.locator(".wa-sync");
    await expect(faixa).toBeVisible();
    await expect(faixa).not.toContainText("%");
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

  /**
   * Mídia que o gateway não guarda é ESTADO, não erro.
   *
   * O 404 aqui é o caso normal e vai acontecer muito: o OpenWA só guarda os
   * bytes do que viu ao vivo, então toda foto anterior ao pareamento responde
   * 404 para sempre. Cara de erro para algo que nunca vai funcionar ensina a
   * pessoa a ignorar avisos -- então cai no marcador de texto do servidor.
   */
  test("mídia que o WhatsApp não entrega vira marcador, não erro", async ({ page }) => {
    await page.goto("/whatsapp");
    await waitForSettled(page);
    const conversas = page.locator(".wa-conversation");
    test.skip(!(await conversas.count()), "não há conversa neste banco");

    // Procura, entre as conversas, alguma com mídia sem bytes.
    let achou = false;
    for (let i = 0; i < Math.min(await conversas.count(), 6); i += 1) {
      await conversas.nth(i).click();
      await waitForSettled(page);
      if (await page.locator(".wa-media-ausente").count()) { achou = true; break; }
    }
    test.skip(!achou, "nenhuma conversa deste banco tem mídia sem bytes guardados");

    const ausente = page.locator(".wa-media-ausente").first();
    // O marcador entre colchetes, e NENHUM ícone: a regra do Lucas é literal.
    await expect(ausente.locator("strong")).toContainText("[");
    expect(await ausente.locator("svg").count(), "marcador virou ícone").toBe(0);
    await expect(ausente.locator("small")).toContainText("anterior à conexão");
  });

  /**
   * Figurinha e áudio aparecem e TOCAM, sem base64.
   *
   * O caminho é `media.url`, que devolve os bytes com Content-Type real e
   * cookie de sessão -- serve direto em <img> e <audio>. Base64 no JSON
   * inflaria 33% e é o caminho que já colocou imagem dentro do banco.
   *
   * Figurinha tem teto próprio: ela NÃO é foto, e esticar uma até o tamanho de
   * foto é o que faz a conversa parecer um mural.
   */
  test("figurinha e áudio aparecem, e a figurinha não vira foto", async ({ page }) => {
    await page.goto("/whatsapp");
    await waitForSettled(page);
    const conversas = page.locator(".wa-conversation");
    test.skip(!(await conversas.count()), "não há conversa neste banco");

    let achou = false;
    for (let i = 0; i < Math.min(await conversas.count(), 8); i += 1) {
      await conversas.nth(i).click();
      await waitForSettled(page);
      if (await page.locator(".wa-media img.is-sticker, .wa-media audio").count()) { achou = true; break; }
    }
    test.skip(!achou, "nenhuma conversa deste banco tem figurinha ou áudio com bytes guardados");

    const figurinha = page.locator(".wa-media img.is-sticker").first();
    if (await figurinha.count()) {
      const medida = await figurinha.evaluate((e) => {
        const i = e as HTMLImageElement;
        return { carregou: i.complete && i.naturalWidth > 0, largura: Math.round(i.getBoundingClientRect().width) };
      });
      expect(medida.carregou, "a figurinha não carregou").toBe(true);
      expect(medida.largura, "figurinha esticada como se fosse foto").toBeLessThanOrEqual(128);
    }

    const audio = page.locator(".wa-media audio").first();
    if (await audio.count()) {
      const medida = await audio.evaluate(async (e) => {
        const a = e as HTMLAudioElement;
        if (a.readyState < 1) await new Promise((r) => { a.addEventListener("loadedmetadata", r, { once: true }); setTimeout(r, 3000); });
        return { controles: a.hasAttribute("controls"), pronto: a.readyState >= 1, erro: a.error ? a.error.code : null };
      });
      expect(medida.controles, "áudio sem controle de tocar").toBe(true);
      expect(medida.erro, "o navegador recusou os bytes do áudio").toBeNull();
      expect(medida.pronto, "o áudio não chegou a ficar pronto para tocar").toBe(true);
    }
  });

  /** A citada aparece dentro do balão, com a prévia que o servidor calculou. */
  test("mensagem citada aparece acima do texto", async ({ page }) => {
    await page.goto("/whatsapp");
    await waitForSettled(page);
    const conversas = page.locator(".wa-conversation");
    test.skip(!(await conversas.count()), "não há conversa neste banco");

    let achou = false;
    for (let i = 0; i < Math.min(await conversas.count(), 6); i += 1) {
      await conversas.nth(i).click();
      await waitForSettled(page);
      if (await page.locator(".wa-bubble-citada").count()) { achou = true; break; }
    }
    test.skip(!achou, "nenhuma conversa deste banco tem mensagem citada");

    const citada = page.locator(".wa-bubble-citada").first();
    await expect(citada).not.toBeEmpty();
    // A citada mora DENTRO do balão: solta, ela viraria uma mensagem a mais.
    expect(await citada.evaluate((e) => Boolean(e.closest(".wa-bubble")))).toBe(true);
  });

  /**
   * O diálogo de encaminhar ABRE e é conferido, mas NADA é encaminhado: o
   * clique num destino sai da máquina, e mensagem em nome da igreja para o
   * número de alguém não se desfaz.
   */
  test("encaminhar oferece um destino por vez e não a própria conversa", async ({ page }) => {
    await page.goto("/whatsapp");
    await waitForSettled(page);
    const conversas = page.locator(".wa-conversation");
    test.skip((await conversas.count()) < 2, "precisa de duas conversas para haver destino");

    const totalConversas = await conversas.count();
    await conversas.first().click();
    await waitForSettled(page);

    const encaminhar = page.locator(".wa-bubble-acoes button", { hasText: "Encaminhar" }).first();
    test.skip(!(await encaminhar.count()), "sem permissão de escrita nesta conta");
    await encaminhar.click();

    const dialogo = page.locator(".wa-forward");
    await expect(dialogo).toBeVisible();
    // A conversa aberta não é destino: encaminhar para onde a mensagem já está
    // não é encaminhar, é reenviar.
    const alvos = await dialogo.locator(".wa-forward-alvos button").count();
    expect(alvos, "a própria conversa apareceu como destino").toBeLessThanOrEqual(totalConversas - 1);
    // Sem caixinha de seleção: acumular destinos viraria disparo sem o teto, o
    // intervalo e a permissão que o disparo tem.
    expect(await dialogo.locator("input[type=checkbox]").count()).toBe(0);

    await page.keyboard.press("Escape");
    await expect(dialogo).toHaveCount(0);
  });

  /**
   * Geometria com uma CONVERSA ABERTA, que é o estado que a suíte de geometria
   * não alcança: ela carrega a tela e mede, e a tela carrega na lista.
   *
   * Alvo de toque só é cobrado no viewport de toque, como em `geometria`: no
   * desktop o piso é 40px por decisão, e cobrar 44 ali acusaria a barra lateral
   * inteira como defeito.
   */
  test("com a conversa aberta, a aba respeita geometria e sobreposição", async ({ page }) => {
    for (const largura of [390, 1280]) {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/whatsapp");
      await waitForSettled(page);

      const primeira = page.locator(".wa-conversation").first();
      if (await primeira.count()) {
        await primeira.click();
        await waitForSettled(page);
      }

      expect(await horizontalOverflow(page), `rolagem lateral em ${largura}px`).toBeNull();
      expect(await textOverText(page), `texto sobre texto em ${largura}px`).toEqual([]);
      if (largura <= 800) {
        expect(await smallTouchTargets(page), `alvo pequeno em ${largura}px`).toEqual([]);
      }
    }
  });

  /**
   * O corpo da conversa tem de rolar POR DENTRO. Se a coluna crescer com o
   * conteúdo, o campo de resposta sai do alcance -- medi 12294px de coluna
   * numa caixa de 632px, e responder virava impossível em conversa comprida.
   * Item de grade nasce com `min-height: auto`, então isto quebra sozinho de
   * novo se alguém mexer no arranjo.
   */
  test("a conversa rola por dentro e o campo de resposta fica alcançável", async ({ page }) => {
    await page.goto("/whatsapp");
    await waitForSettled(page);
    const primeira = page.locator(".wa-conversation").first();
    test.skip(!(await primeira.count()), "não há conversa neste banco para abrir");
    await primeira.click();
    await waitForSettled(page);

    const medidas = await page.evaluate(() => {
      const caixa = document.querySelector(".wa-inbox") as HTMLElement;
      const pane = document.querySelector(".wa-pane") as HTMLElement;
      const campo = document.querySelector(".wa-composer textarea");
      return {
        alturaCaixa: Math.round(caixa.getBoundingClientRect().height),
        alturaPane: Math.round(pane.getBoundingClientRect().height),
        campoNaTela: campo ? campo.getBoundingClientRect().bottom <= window.innerHeight + 1 : null,
      };
    });

    expect(medidas.alturaPane, "a coluna da conversa cresceu além da caixa").toBeLessThanOrEqual(
      medidas.alturaCaixa + 1,
    );
    if (medidas.campoNaTela !== null) {
      expect(medidas.campoNaTela, "o campo de resposta ficou fora da tela").toBe(true);
    }
  });
});
