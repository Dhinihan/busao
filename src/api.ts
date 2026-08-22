import type { Linha, PosicoesDaLinha, StatusApi } from "./types";

export class ErroApi extends Error {}

function mensagemDeErro(corpo: unknown, status: number): string {
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

async function lerErro(resposta: Response): Promise<ErroApi> {
  const corpo: unknown = await resposta.json().catch(() => null);
  return new ErroApi(mensagemDeErro(corpo, resposta.status));
}

async function obterJson<T>(url: string): Promise<T> {
  const resposta = await fetch(url);
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new ErroApi(mensagemDeErro(corpo, resposta.status));
  return corpo as T;
}

function ehLinha(valor: unknown): valor is Linha {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "id" in valor &&
    typeof valor.id === "number" &&
    "letreiro" in valor &&
    typeof valor.letreiro === "string" &&
    "descricao" in valor &&
    typeof valor.descricao === "string"
  );
}

export const api = {
  status(): Promise<StatusApi> {
    return obterJson("/api/status");
  },

  async buscarLinhas(termo: string): Promise<readonly Linha[]> {
    const dados = await obterJson<unknown>(
      `/api/linhas?termo=${encodeURIComponent(termo)}`,
    );
    if (!Array.isArray(dados)) {
      throw new ErroApi("resposta inesperada na busca de linhas");
    }
    const linhas: Linha[] = [];
    for (const item of dados) {
      if (ehLinha(item)) linhas.push(item);
    }
    return linhas;
  },

  posicoes(codigoLinha: number): Promise<PosicoesDaLinha> {
    return obterJson(`/api/posicoes/${codigoLinha}`);
  },

  async salvarToken(token: string): Promise<boolean> {
    const resposta = await fetch("/api/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!resposta.ok) throw await lerErro(resposta);
    const corpo: unknown = await resposta.json().catch(() => null);
    return (
      typeof corpo === "object" &&
      corpo !== null &&
      "validado" in corpo &&
      corpo.validado === true
    );
  },

  async apagarToken(): Promise<void> {
    const resposta = await fetch("/api/token", { method: "DELETE" });
    if (!resposta.ok) throw await lerErro(resposta);
  },
};
