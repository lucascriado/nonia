// Geração de CSV para abrir no Excel em português.
//
// Quem abre estes arquivos é secretaria de igreja, no Excel brasileiro. Um CSV
// "tecnicamente correto" -- vírgula como separador, UTF-8 sem BOM -- abre lá
// como UMA coluna só e com os acentos quebrados, e a pessoa conclui que o
// sistema está com defeito. Por isso, e são decisões deliberadas:
//
//   separador   ponto e vírgula, que é o que o Excel pt-BR espera
//   codificação UTF-8 COM BOM, senão "João" vira "JoÃ£o"
//   quebra      CRLF, como manda o RFC 4180 e como o Excel prefere
//   datas       dd/mm/aaaa
//   números     vírgula decimal, sem separador de milhar (o milhar atrapalha
//               o Excel a reconhecer a célula como número)

const BOM = "\uFEFF";
const SEP = ";";
const EOL = "\r\n";

/**
 * Neutraliza injeção de fórmula.
 *
 * Uma célula que começa com = + - @ é FÓRMULA no Excel: um membro cadastrado
 * como `=1+1` vira conta, e construções piores conseguem chamar programa
 * externo. O dado vem de formulário aberto, então tem que ser neutralizado.
 * O apóstrofo à frente marca a célula como texto e não aparece na planilha.
 */
function neutralizarFormula(valor: string) {
  return /^[=+\-@\t\r]/.test(valor) ? `'${valor}` : valor;
}

function escapar(valor: string) {
  if (/[";\r\n]/.test(valor)) return `"${valor.replace(/"/g, '""')}"`;
  return valor;
}

/** Célula de texto: neutraliza fórmula e escapa. */
export const texto = (valor: unknown) =>
  escapar(neutralizarFormula(valor === null || valor === undefined ? "" : String(valor)));

/** Célula que o próprio sistema gerou (data, número): não precisa neutralizar. */
export const bruto = (valor: unknown) =>
  escapar(valor === null || valor === undefined ? "" : String(valor));

/**
 * Data no formato brasileiro.
 *
 * "2026-09-06" é tratado como texto e não como instante: `new Date("2026-09-06")`
 * é meia-noite em UTC e vira 05/09 no fuso de São Paulo -- o erro clássico que
 * faz o relatório inteiro ficar um dia atrasado.
 */
export function dataBR(valor: unknown): string {
  if (!valor) return "";
  if (typeof valor === "string") {
    const so = valor.slice(0, 10);
    const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(so);
    if (partes) return `${partes[3]}/${partes[2]}/${partes[1]}`;
  }
  const d = valor instanceof Date ? valor : new Date(String(valor));
  return Number.isNaN(d.getTime())
    ? ""
    : `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

/** Valor monetário: vírgula decimal, sem separador de milhar. */
export function valorBR(valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "";
  const n = Number(valor);
  return Number.isFinite(n) ? n.toFixed(2).replace(".", ",") : "";
}

export function montarCsv(cabecalho: string[], linhas: string[][]): string {
  const corpo = [cabecalho.map(bruto).join(SEP), ...linhas.map((l) => l.join(SEP))];
  return BOM + corpo.join(EOL) + EOL;
}

const semAcento = (valor: string) =>
  valor.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-");

/**
 * Resposta de download. O nome carrega o recurso, a organização e a data, para
 * a pasta de downloads não virar cinco "export.csv".
 */
export function respostaCsv(csv: string, recurso: string, organizationSlug: string) {
  const hoje = new Date();
  const dia = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-${String(hoje.getDate()).padStart(2, "0")}`;
  const nome = `nonia-${recurso}-${organizationSlug}-${dia}.csv`;
  const ascii = semAcento(nome);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      // filename para navegador antigo, filename* para o nome real em UTF-8.
      "content-disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(nome)}`,
      "cache-control": "no-store",
    },
  });
}

/** Aceita o rótulo da tela ou o valor do banco, e devolve o do banco. */
export function normalizar(valor: string | null, mapa: Record<string, string>): string | null {
  if (!valor || valor === "all") return null;
  const chave = valor.trim();
  return mapa[chave] ?? mapa[chave.toLowerCase()] ?? chave;
}
