// Zip dos comprovantes do financeiro.
//
// O caso de uso é prestação de contas: a tesouraria entrega a pasta de
// comprovantes a um conselho, a uma assembleia ou ao contador, junto da
// planilha e referente a um período. Baixar 200 anexos um a um não é entrega,
// é tarefa.
//
// É LEITURA -- finance.read -- então funciona em modo somente leitura, pela
// mesma promessa da exportação em CSV: a igreja leva o que é dela.
//
// Usa os MESMOS filtros da listagem e do CSV, de lib/listings.ts. "Os
// comprovantes do que estou vendo" deixou de depender de disciplina quando os
// três passaram a montar o WHERE no mesmo lugar.
import { QueryTypes } from "sequelize";
import { db } from "@/lib/db";
import { organizationId, requirePermission } from "@/lib/auth";
import { nomeDeArquivo } from "@/lib/csv";
import { csvDoFinanceiro } from "@/lib/finance-csv";
import { filtrosDeFinanceiro } from "@/lib/listings";
import { notFound, HttpError } from "@/lib/http";
import { anexoParaBytes, ZipEmFluxo } from "@/lib/zip";
import { apiError } from "@/lib/records";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Teto de comprovantes por download.
 *
 * A memória não é o limite: o zip é escrito em fluxo, um anexo por vez. O que
 * o teto protege é o tempo da requisição e o tamanho do arquivo que a pessoa
 * vai receber -- e o formato ZIP clássico, que endereça no máximo 4 GB.
 * Melhor um limite que a pessoa entende, com instrução do que fazer, do que um
 * download que às vezes falha no meio.
 */
const TETO = 500;

const semAcento = (v: string) =>
  v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Za-z0-9._ -]+/g, "-");

/**
 * Data no começo do nome, em aaaa-mm-dd.
 *
 * Escolhi ISO e não dd-mm-aaaa de propósito: só o ISO faz a PASTA ordenar
 * cronologicamente quando o sistema ordena por nome, que é como a tesouraria
 * abre os comprovantes de um período. Com dd-mm-aaaa, 15 de agosto cai depois
 * de 1º de setembro. Continua casando com a coluna Data da planilha sem
 * esforço -- 06/09/2026 e 2026-09-06 são a mesma data para qualquer leitor.
 */
const dataParaNome = (v: string) => (v ? v.slice(0, 10) : "sem-data");

type Linha = {
  id: string;
  transactionDate: string;
  type: string;
  description: string;
  attachmentUrl: string;
};

export async function GET(request: Request) {
  try {
    const auth = await requirePermission("finance.read");
    const { searchParams } = new URL(request.url);

    const naLixeira = searchParams.get("deleted") === "1";
    const filtro = filtrosDeFinanceiro(searchParams, organizationId(auth), { incluirLixeira: naLixeira });
    // Lançamento sem comprovante simplesmente não entra: nada de marcador nem
    // de arquivo vazio para a pessoa decifrar.
    const where = [...filtro.where, "attachment_url IS NOT NULL"].join(" AND ");

    const contagem = await db.query<{ total: number }>(
      `SELECT count(*)::int AS total FROM financial_transactions WHERE ${where}`,
      { bind: filtro.valores, type: QueryTypes.SELECT },
    );
    const total = contagem[0].total;

    // Zip vazio que a pessoa abre e não entende é pior que uma mensagem.
    if (total === 0) {
      throw notFound(
        "Nenhum lançamento com comprovante no filtro selecionado. Ajuste o período ou os filtros e tente de novo.",
        "no_attachments",
      );
    }

    if (total > TETO) {
      throw new HttpError(
        413,
        `São ${total} comprovantes, e o download vai até ${TETO} por vez. ` +
          "Filtre por um período menor -- por mês, por exemplo -- e baixe em partes.",
        "too_many_attachments",
        { total, limit: TETO },
      );
    }

    // Só os identificadores e os metadados vêm de uma vez; são leves. O anexo
    // de cada um é buscado na hora de escrever, para nunca haver mais de um
    // comprovante em memória.
    const linhas = await db.query<Omit<Linha, "attachmentUrl">>(
      `SELECT id, transaction_date AS "transactionDate", type, description
       FROM financial_transactions WHERE ${where}
       ORDER BY transaction_date, created_at`,
      { bind: filtro.valores, type: QueryTypes.SELECT },
    );

    const zip = new ZipEmFluxo();
    const usados = new Map<string, number>();

    // UM comprovante por chamada de `pull`, e não um laço que enfileira
    // todos de uma vez.
    //
    // A diferença não é estilo: `enqueue` num laço IGNORA a contrapressão, e
    // os pedaços se acumulam na fila do fluxo até a resposta inteira estar em
    // memória -- "streaming" só no nome. Medi as duas versões com 500
    // comprovantes: enfileirando tudo, o processo subiu 1,3 GB; devolvendo
    // um por vez, sobe algumas dezenas de MB, porque o fluxo só pede o
    // próximo quando o cliente consumiu o anterior.
    // A planilha vai DENTRO do zip, do MESMO gerador do download avulso.
    //
    // O caso de uso é entregar a prestação de contas: a pasta de comprovantes
    // junto da planilha, num arquivo só. Duas versões do CSV divergiriam no
    // dia em que alguém mexesse numa coluna, e a divergência apareceria só
    // para quem baixou pelo outro caminho -- por isso vem de lib/finance-csv.
    //
    // Ela reflete o MESMO filtro do usuário, mas SEM a restrição de "tem
    // anexo": a planilha da prestação de contas precisa mostrar TODOS os
    // lançamentos do período, inclusive os SEM comprovante. A coluna
    // "Comprovante: Não" é justamente o que o conselho procura -- esconder
    // essas linhas esconderia a lacuna que se está prestando contas sobre.
    const planilha = Buffer.from(await csvDoFinanceiro(filtro), "utf8");
    let planilhaEnviada = false;
    let indice = 0;

    const fluxo = new ReadableStream<Uint8Array>({
      async pull(controller) {
        try {
          if (!planilhaEnviada) {
            planilhaEnviada = true;
            controller.enqueue(
              zip.escrever({
                nome: nomeDeArquivo("financeiro", auth.organization.slug),
                conteudo: planilha,
                data: new Date(),
              }),
            );
            return;
          }

          while (indice < linhas.length) {
            const linha = linhas[indice];
            indice += 1;

            const anexos = await db.query<{ attachmentUrl: string }>(
              `SELECT attachment_url AS "attachmentUrl" FROM financial_transactions
               WHERE id = $1 AND organization_id = $2`,
              { bind: [linha.id, organizationId(auth)], type: QueryTypes.SELECT },
            );
            const bytes = anexos[0]?.attachmentUrl ? anexoParaBytes(anexos[0].attachmentUrl) : null;
            // Anexo ilegível é pulado em silêncio: melhor entregar 199 de 200
            // do que falhar o download inteiro por causa de uma linha torta.
            if (!bytes) continue;

            // Nome para conferência humana: a data primeiro, em aaaa-mm-dd,
            // depois o tipo e a descrição, que é como a linha é reconhecida
            // na planilha.
            const tipo = linha.type === "income" ? "Entrada" : "Saida";
            const base = semAcento(
              `${dataParaNome(linha.transactionDate)} - ${tipo} - ${linha.description}`,
            ).slice(0, 120);
            const vezes = (usados.get(base) ?? 0) + 1;
            usados.set(base, vezes);
            // Dois lançamentos no mesmo dia com a mesma descrição existem
            // (duas ofertas, dois aluguéis). O sufixo resolve sem esconder
            // nenhum dos dois.
            // Numa subpasta: ao abrir o zip a pessoa vê UMA planilha e UMA
            // pasta, em vez da planilha perdida no meio de 200 arquivos.
            const nome = `comprovantes/${base}${vezes > 1 ? ` (${vezes})` : ""}.${bytes.extensao}`;

            controller.enqueue(
              zip.escrever({ nome, conteudo: bytes.conteudo, data: new Date(linha.transactionDate) }),
            );
            return; // devolve o controle: o próximo só vem quando pedirem
          }

          controller.enqueue(zip.finalizar());
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      },
    });

    const hoje = new Date().toISOString().slice(0, 10);
    const nomeArquivo = semAcento(`nonia-comprovantes-${auth.organization.slug}-${hoje}.zip`);

    return new Response(fluxo, {
      headers: {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${nomeArquivo}"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
