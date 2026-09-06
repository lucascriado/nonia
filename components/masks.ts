/**
 * Máscaras de campo compartilhadas. Ficavam privadas no PersonRecordDialog;
 * saíram de lá quando o formulário de cadastro passou a precisar das mesmas
 * regras — telefone digitado na landing e telefone digitado na ficha do membro
 * têm que sair iguais.
 */
export function digitsOnly(value: string, maxLength: number) {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

export function maskCpf(value: string) {
  return digitsOnly(value, 11).replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
}

export function maskPhone(value: string) {
  const digits = digitsOnly(value, 11);
  if (digits.length <= 10) return digits.replace(/^(\d{2})(\d)/, "($1) $2").replace(/(\d{4})(\d)/, "$1-$2");
  return digits.replace(/^(\d{2})(\d)(\d)/, "($1) $2 $3").replace(/(\d{4})(\d)/, "$1-$2");
}

export function maskZipCode(value: string) {
  return digitsOnly(value, 8).replace(/^(\d{5})(\d)/, "$1-$2");
}
