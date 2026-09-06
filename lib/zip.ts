// Escritor de ZIP mínimo, em fluxo.
//
// POR QUE NÃO UMA BIBLIOTECA: o projeto evita dependência sem necessidade
// clara, e aqui não há. O ZIP com o método "store" é um formato simples --
// cabeçalho por arquivo, diretório central no fim -- e escrever os 100 e
// poucos bytes de estrutura sai mais barato que carregar um pacote.
//
// POR QUE "STORE" E NÃO DEFLATE: os comprovantes são PDF, PNG e JPEG, que já
// nascem comprimidos. Deflate neles gasta CPU e devolve quase o mesmo tamanho.
//
// POR QUE EM FLUXO, e é a decisão que importa: montar o zip inteiro em memória
// significaria segurar todos os anexos ao mesmo tempo. Com o teto de 2 MB por
// comprovante, algumas centenas de lançamentos estourariam o heap do Node e
// derrubariam o PROCESSO -- ou seja, a sessão de todo mundo, não só a de quem
// pediu o download. Escrevendo em fluxo, a memória fica no tamanho de UM
// anexo por vez, e o que se acumula é só o diretório central: nome, tamanho e
// posição de cada arquivo.

import { createHash } from "node:crypto";

const TABELA_CRC = (() => {
  const tabela = new Int32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[i] = c;
  }
  return tabela;
})();

function crc32(buffer: Buffer): number {
  let c = 0 ^ -1;
  for (let i = 0; i < buffer.length; i += 1) c = (c >>> 8) ^ TABELA_CRC[(c ^ buffer[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

/** Data e hora no formato DOS, que é o que o ZIP guarda. */
function dataDos(data: Date) {
  const hora = ((data.getHours() << 11) | (data.getMinutes() << 5) | (data.getSeconds() >> 1)) & 0xffff;
  const dia = (((data.getFullYear() - 1980) << 9) | ((data.getMonth() + 1) << 5) | data.getDate()) & 0xffff;
  return { hora, dia };
}

export type EntradaZip = { nome: string; conteudo: Buffer; data: Date };

type Registro = { nome: Buffer; crc: number; tamanho: number; offset: number; hora: number; dia: number };

/**
 * Monta o ZIP em pedaços. Cada `escrever` devolve os bytes de um arquivo;
 * `finalizar` devolve o diretório central e o fecho.
 */
export class ZipEmFluxo {
  private registros: Registro[] = [];
  private posicao = 0;

  escrever(entrada: EntradaZip): Buffer {
    const nome = Buffer.from(entrada.nome, "utf8");
    const crc = crc32(entrada.conteudo);
    const { hora, dia } = dataDos(entrada.data);

    const cabecalho = Buffer.alloc(30);
    cabecalho.writeUInt32LE(0x04034b50, 0);
    cabecalho.writeUInt16LE(20, 4);
    // Bit 11 ligado: o nome do arquivo está em UTF-8. Sem ele, acento em
    // "Dízimos" vira lixo ao abrir no Windows.
    cabecalho.writeUInt16LE(0x0800, 6);
    cabecalho.writeUInt16LE(0, 8);
    cabecalho.writeUInt16LE(hora, 10);
    cabecalho.writeUInt16LE(dia, 12);
    cabecalho.writeUInt32LE(crc, 14);
    cabecalho.writeUInt32LE(entrada.conteudo.length, 18);
    cabecalho.writeUInt32LE(entrada.conteudo.length, 22);
    cabecalho.writeUInt16LE(nome.length, 26);
    cabecalho.writeUInt16LE(0, 28);

    this.registros.push({ nome, crc, tamanho: entrada.conteudo.length, offset: this.posicao, hora, dia });
    this.posicao += cabecalho.length + nome.length + entrada.conteudo.length;

    return Buffer.concat([cabecalho, nome, entrada.conteudo]);
  }

  finalizar(): Buffer {
    const partes: Buffer[] = [];
    let tamanhoDiretorio = 0;

    for (const r of this.registros) {
      const c = Buffer.alloc(46);
      c.writeUInt32LE(0x02014b50, 0);
      c.writeUInt16LE(20, 4);
      c.writeUInt16LE(20, 6);
      c.writeUInt16LE(0x0800, 8);
      c.writeUInt16LE(0, 10);
      c.writeUInt16LE(r.hora, 12);
      c.writeUInt16LE(r.dia, 14);
      c.writeUInt32LE(r.crc, 16);
      c.writeUInt32LE(r.tamanho, 20);
      c.writeUInt32LE(r.tamanho, 24);
      c.writeUInt16LE(r.nome.length, 28);
      c.writeUInt32LE(0, 30); // extra e comentário
      c.writeUInt16LE(0, 34); // disco inicial
      c.writeUInt16LE(0, 36); // atributos internos
      c.writeUInt32LE(0, 38); // atributos externos
      c.writeUInt32LE(r.offset, 42);
      partes.push(c, r.nome);
      tamanhoDiretorio += c.length + r.nome.length;
    }

    const fim = Buffer.alloc(22);
    fim.writeUInt32LE(0x06054b50, 0);
    fim.writeUInt16LE(0, 4);
    fim.writeUInt16LE(0, 6);
    fim.writeUInt16LE(this.registros.length, 8);
    fim.writeUInt16LE(this.registros.length, 10);
    fim.writeUInt32LE(tamanhoDiretorio, 12);
    fim.writeUInt32LE(this.posicao, 16);
    fim.writeUInt16LE(0, 20);
    partes.push(fim);

    return Buffer.concat(partes);
  }

  get quantidade() {
    return this.registros.length;
  }
}

/** Converte o data URL guardado no banco em bytes e extensão. */
export function anexoParaBytes(dataUrl: string): { conteudo: Buffer; extensao: string } | null {
  const casa = /^data:(image\/png|image\/jpeg|application\/pdf);base64,([\s\S]+)$/.exec(dataUrl);
  if (!casa) return null;
  const extensao = casa[1] === "application/pdf" ? "pdf" : casa[1] === "image/png" ? "png" : "jpg";
  return { conteudo: Buffer.from(casa[2], "base64"), extensao };
}

/** Só para conferência em teste: identifica o conteúdo sem guardá-lo. */
export const resumoDeBytes = (b: Buffer) => createHash("sha256").update(b).digest("hex").slice(0, 12);
