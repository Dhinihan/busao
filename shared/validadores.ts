export const TERMO_MINIMO = 3;

export const MENSAGEM_TERMO_CURTO = "digite ao menos 3 caracteres";
export const MENSAGEM_LINHA_INVALIDA = "linha inválida";

export function termoValido(termo: string): boolean {
  return termo.trim().length >= TERMO_MINIMO;
}

export function idLinhaValido(id: number): boolean {
  return Number.isInteger(id) && id > 0;
}
