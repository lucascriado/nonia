import type { Page } from "@playwright/test";

/**
 * Conta de demonstração do nonia_dev.
 *
 * Os testes só LEEM. Nenhum cria, edita ou apaga registro — o banco é
 * compartilhado com o resto do time. Quando um teste precisar de um estado que
 * o banco não tem, o estado é pedido a quem cuida do banco, e não criado aqui.
 */
export const DEMO = { email: "demo@nonia.app", password: "demo1234" };

/**
 * A conta que a suíte usa. Continua sendo a `demo@nonia.app` do `nonia_dev`
 * por padrão -- ninguém precisa configurar nada.
 *
 * As variáveis existem porque nem todo estado se testa no banco compartilhado:
 * a caixa de entrada precisa de conversa, e conversa não se semeia lá. Quem
 * roda contra um banco próprio aponta a conta dele por aqui.
 */
export const CONTA = {
  email: process.env.NONIA_LOGIN ?? DEMO.email,
  password: process.env.NONIA_SENHA ?? DEMO.password,
};

/** Telas do app protegidas por sessão. */
export const APP_SCREENS = [
  "/painel",
  "/membros",
  "/visitantes",
  "/ministerios",
  "/whatsapp",
  "/financeiro",
  "/atividades",
  "/calendario",
  "/configuracoes",
  "/usuarios",
];

export const PUBLIC_SCREENS = ["/", "/faq", "/precos", "/entrar", "/cadastro"];

export async function login(page: Page) {
  const response = await page.request.post("/api/auth/login", { data: CONTA });
  if (!response.ok()) throw new Error(`login falhou: ${response.status()}`);
}

/**
 * Texto sobrepondo texto entre irmãos — o sintoma exato de dois defeitos já
 * corridos: o cartão de indicador com o valor por cima do rótulo, e o "+N" da
 * pilha de avatares por baixo do avatar seguinte.
 */
export async function textOverText(page: Page) {
  return page.evaluate(() => {
    const hasOwnText = (n: Element) => [...n.childNodes].some((c) => c.nodeType === 3 && c.textContent?.trim());
    // Sobreposição declarada no próprio componente. A pilha de avatares no
    // desktop se sobrepõe de propósito; a exceção mora ao lado da decisão de
    // desenho, e não escondida aqui dentro.
    const intentional = (n: Element) => n.closest('[data-sobreposicao="intencional"]') !== null;
    const boxes = [...document.querySelectorAll("body *")].filter((n) => {
      const cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || Number(cs.opacity) < 0.1) return false;
      if (cs.position === "absolute" || cs.position === "fixed") return false;
      const r = n.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && hasOwnText(n) && !intentional(n);
    });

    // Compara LINHA a linha, não a caixa que envolve tudo. Dois links em
    // linhas diferentes de um mesmo parágrafo têm caixas envolventes que se
    // cruzam sem que nada esteja sobreposto de verdade — usar a caixa
    // envolvente acusaria texto correndo normal como defeito.
    const linesOf = (n: Element) => [...n.getClientRects()].filter((r) => r.width > 0 && r.height > 0);

    const found: string[] = [];
    for (const a of boxes) {
      for (const b of boxes) {
        if (a === b || a.contains(b) || b.contains(a) || a.parentElement !== b.parentElement) continue;
        const overlaps = linesOf(a).some((ra) =>
          linesOf(b).some((rb) => {
            const x = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
            const y = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
            return x > 2 && y > 2;
          }),
        );
        if (overlaps) {
          const label = (n: Element) => `${n.tagName}.${String(n.className).split(" ")[0]}"${n.textContent?.trim().slice(0, 20)}"`;
          found.push([label(a), label(b)].sort().join(" X "));
        }
      }
    }
    return [...new Set(found)];
  });
}

/**
 * Alvos abaixo de 44x44. Link dentro de frase é exceção explícita da WCAG
 * 2.5.8 e fica de fora — centralizar o critério aqui evita que cada teste
 * invente o seu.
 */
export async function smallTouchTargets(page: Page) {
  return page.evaluate(() => {
    const inline = (n: Element) => {
      const cs = getComputedStyle(n);
      return n.tagName === "A" && cs.display === "inline" && n.closest("p") !== null;
    };
    // Caixa de seleção dentro de <label>: quem recebe o toque é o rótulo
    // inteiro, não o quadradinho de 20px. Medir o input daria falso positivo
    // num alvo que na prática é confortável.
    const targetOf = (n: Element) => {
      const input = n as HTMLInputElement;
      if (n.tagName === "INPUT" && (input.type === "checkbox" || input.type === "radio")) {
        return n.closest("label") ?? n;
      }
      return n;
    };

    return [...new Set(
      [...document.querySelectorAll("button, a[href], select, input:not([type=file]), [role=button]")]
        .filter((n) => {
          const r = targetOf(n).getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !inline(n) && (r.width < 44 || r.height < 44);
        })
        .map((n) => {
          const r = targetOf(n).getBoundingClientRect();
          const name = String(n.className).trim().split(" ")[0] || n.tagName;
          return `${name}:${Math.round(r.width)}x${Math.round(r.height)}`;
        }),
    )];
  });
}

/** Rolagem lateral: a página nunca deve rolar de lado. */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth > window.innerWidth + 1 ? { scrollWidth: doc.scrollWidth, viewport: window.innerWidth } : null;
  });
}

/**
 * Espera a tela ASSENTAR antes de medir.
 *
 * Esqueleto de carregamento não é o que a regra de alvo de toque avalia: ele
 * aparece por instantes e some. Medir num tempo fixo faz o teste às vezes
 * cair no meio do carregamento e acusar defeito que não existe — teste que
 * falha à toa deixa de ser lido.
 */
export async function waitForSettled(page: Page) {
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => document.querySelectorAll(".skeleton, [aria-busy='true']").length === 0, null, {
    timeout: 10_000,
  }).catch(() => undefined);
  // Uma volta de animação depois do último layout.
  await page.waitForTimeout(400);
}
