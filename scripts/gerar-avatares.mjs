// Gera os avatares como PNG e escreve components/avatar-presets.ts.
// PNG porque é o que o backend aceita (lib/records.ts: só data URI PNG ou JPG).
// Gerado UMA VEZ, aqui, e não no navegador: o valor guardado precisa ser
// idêntico byte a byte para toda pessoa, senão a marca "escolhido" não casa
// entre navegadores diferentes.
import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";

const S = 48;
const TONS = ["#1b5e3f", "#4a5740", "#7b6238", "#64695e"];
const TRACO = [0xee, 0xf1, 0xe8];

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Cada marca responde: este pixel é traço? Coordenadas em 0..47. */
const MARCAS = [
  (x, y) => Math.hypot(x - 24, y - 24) <= 9,
  (x, y) => { const d = Math.hypot(x - 24, y - 24); return d <= 12 && d >= 8; },
  (x, y) => Math.hypot(x - 24, y - 24) <= 11 && x >= 24,
  (x, y) => x >= 15 && x <= 33 && y >= 15 && y <= 33,
  (x, y) => y >= 14 && y <= 32 && Math.abs(x - 24) <= (y - 14) * 10 / 18,
  (x, y) => Math.abs(x - 24) + Math.abs(y - 24) <= 12,
  (x, y) => x >= 12 && x <= 36 && ((y >= 19 && y <= 23) || (y >= 27 && y <= 31)),
  (x, y) => [[18, 18], [30, 18], [18, 30], [30, 30]].some(([cx, cy]) => Math.hypot(x - cx, y - cy) <= 4.5),
];

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (const b of buf) {
    c = (crc ^ b) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = c ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(tipo, dados) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length);
  const corpo = Buffer.concat([Buffer.from(tipo, "ascii"), dados]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([len, corpo, crc]);
}

function png(marca, fundoHex) {
  const fundo = hex(fundoHex);
  const linhas = [];
  for (let y = 0; y < S; y++) {
    const linha = Buffer.alloc(1 + S * 3);
    for (let x = 0; x < S; x++) {
      // 4x4 amostras por pixel: sem isso a borda curva sai serrilhada num
      // desenho de 48px que a tela mostra a 44.
      let dentro = 0;
      for (let sy = 0; sy < 4; sy++) {
        for (let sx = 0; sx < 4; sx++) {
          if (marca(x + (sx + 0.5) / 4, y + (sy + 0.5) / 4)) dentro++;
        }
      }
      const t = dentro / 16;
      for (let c = 0; c < 3; c++) linha[1 + x * 3 + c] = Math.round(fundo[c] + (TRACO[c] - fundo[c]) * t);
    }
    linhas.push(linha);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;   // bits por canal
  ihdr[9] = 2;   // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(Buffer.concat(linhas), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const uris = MARCAS.map((marca, i) => {
  const buf = png(marca, TONS[i % TONS.length]);
  return `data:image/png;base64,${buf.toString("base64")}`;
});

const arquivo = `/**
 * Avatares prontos, como PNG em data URI.
 *
 * GERADOS UMA VEZ E FIXOS NO CÓDIGO, de propósito. Se fossem desenhados no
 * navegador, o PNG sairia com bytes diferentes em cada motor, e a comparação
 * que marca "este é o seu" deixaria de casar para quem escolhesse num
 * navegador e olhasse noutro.
 *
 * PNG porque é o que o servidor aceita: \`validatePhoto\` em lib/records.ts só
 * deixa passar data URI de PNG ou JPG. SVG seria menor, e foi tentado antes --
 * o servidor recusou com "A foto deve ser PNG ou JPG".
 *
 * Cada um pesa cerca de ${Math.round(uris.reduce((a, u) => a + Buffer.byteLength(u), 0) / uris.length)} bytes, contra um teto de campo de
 * 120 KB e uma foto de verdade que chega perto dele.
 *
 * As cores são os tons escuros da paleta -- sage, oliva, areia e neutro quente
 * -- com a forma clara por cima. Elas NÃO acompanham o tema, e é deliberado:
 * imagem guardada não muda com o tema, e um disco opaco se lê nos dois.
 *
 * Para mudar os desenhos, edite e rode o gerador em
 * scripts/gerar-avatares.mjs; não edite estas strings à mão.
 */
export const AVATAR_PRESETS = [
${uris.map((u) => `  "${u}",`).join("\n")}
];
`;
writeFileSync("components/avatar-presets.ts", arquivo);
console.log("bytes por avatar:", uris.map((u) => Buffer.byteLength(u)).join(", "));
