export function mensagemDeErro(corpo: unknown, status: number): string {
  if (
    typeof corpo === "object" &&
    corpo !== null &&
    "erro" in corpo &&
    typeof corpo.erro === "string" &&
    corpo.erro !== ""
  ) {
    if (corpo.erro === "token recusado pela SPTrans") {
      return (
        "a SPTrans ainda não ativou essa chave — chaves recém-criadas podem " +
        "levar alguns dias. Tentamos reconectar automaticamente."
      );
    }
    return corpo.erro;
  }
  return `falha na comunicação com o servidor (HTTP ${status})`;
}
