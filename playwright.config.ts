import { defineConfig, devices } from "@playwright/test";

/**
 * Os testes rodam contra o `next dev` e o nonia_dev, sem mock.
 *
 * A escolha por navegador de verdade não é preferência: TODOS os defeitos de
 * interface encontrados neste projeto foram de layout renderizado — texto
 * sobre texto, alvo abaixo de 44px, estouro lateral, botão fora do campo.
 * Em jsdom nada disso existe, porque ele não faz layout e devolve zero em
 * `getBoundingClientRect`. Teste que não mede pixel não pegaria nenhum deles.
 */
export default defineConfig({
  testDir: "./tests/interface",
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: process.env.NONIA_URL ?? "http://localhost:3111",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
