// Validação de CPF e CNPJ.
//
// ATENÇÃO AO CNPJ ALFANUMÉRICO: desde 31/07/2026 a Receita emite CNPJ com
// LETRAS nas 12 primeiras posições (os 2 dígitos verificadores continuam
// numéricos). Um validador que aceite só dígitos RECUSA CNPJ legítimo emitido
// de agosto de 2026 em diante -- e recusar o documento de quem está se
// cadastrando é perder o cliente na porta.
//
// A regra do dígito é a mesma para os dois formatos: módulo 11, convertendo
// cada caractere pelo código ASCII menos 48 ('0'..'9' viram 0..9, 'A' vira 17,
// 'Z' vira 42). É retrocompatível de propósito: um CNPJ numérico antigo gera
// exatamente o mesmo dígito sob a regra nova, então não existem duas
// validações a manter -- existe uma.

const limpar = (valor: string) => valor.replace(/[^0-9A-Za-z]/g, "").toUpperCase();

/** Código ASCII menos 48, que é como a Receita converte letra em número. */
const peso = (caractere: string) => caractere.charCodeAt(0) - 48;

function digitosCnpj(base: string): string {
  let corpo = base;
  for (const pesos of [
    [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
    [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2],
  ]) {
    const soma = pesos.reduce((acc, p, i) => acc + peso(corpo[i]) * p, 0);
    const resto = soma % 11;
    corpo += String(resto < 2 ? 0 : 11 - resto);
  }
  return corpo.slice(12);
}

function digitosCpf(base: string): string {
  let corpo = base;
  for (const tamanho of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < tamanho; i += 1) soma += Number(corpo[i]) * (tamanho + 1 - i);
    const resto = (soma * 10) % 11;
    corpo += String(resto === 10 ? 0 : resto);
  }
  return corpo.slice(9);
}

const todosIguais = (valor: string) => /^(.)\1+$/.test(valor);

export type Documento = { tipo: "CPF" | "CNPJ"; formatado: string };

/**
 * Valida e devolve o documento no formato canônico, ou null se for inválido.
 * Guardar sempre formatado do mesmo jeito evita a mesma igreja aparecer com
 * duas grafias do mesmo número.
 */
export function validarDocumento(valor: string): Documento | null {
  const cru = limpar(valor);

  if (cru.length === 11) {
    if (!/^\d{11}$/.test(cru) || todosIguais(cru)) return null;
    if (digitosCpf(cru.slice(0, 9)) !== cru.slice(9)) return null;
    return { tipo: "CPF", formatado: `${cru.slice(0, 3)}.${cru.slice(3, 6)}.${cru.slice(6, 9)}-${cru.slice(9)}` };
  }

  if (cru.length === 14) {
    // 12 posições alfanuméricas + 2 dígitos verificadores numéricos.
    if (!/^[0-9A-Z]{12}\d{2}$/.test(cru) || todosIguais(cru)) return null;
    if (digitosCnpj(cru.slice(0, 12)) !== cru.slice(12)) return null;
    return {
      tipo: "CNPJ",
      formatado: `${cru.slice(0, 2)}.${cru.slice(2, 5)}.${cru.slice(5, 8)}/${cru.slice(8, 12)}-${cru.slice(12)}`,
    };
  }

  return null;
}
