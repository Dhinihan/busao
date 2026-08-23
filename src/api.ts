import { mensagemDeErro } from "../shared/mensagens.ts";
import { ehLinha, ehStatus, paraPosicoesDoCliente } from "../shared/parsers.ts";
import type {
  Linha,
  PosicoesDaLinha,
  StatusApi,
} from "../shared/tipos.ts";

export class ErroApi extends Error {}

async function lerErro(resposta: Response): Promise<ErroApi> {
  const corpo: unknown = await resposta.json().catch(() => null);
  return new ErroApi(mensagemDeErro(corpo, resposta.status));
}

async function obterCorpo(url: string, init?: RequestInit): Promise<unknown> {
  const resposta = await fetch(url, init);
  const corpo: unknown = await resposta.json().catch(() => null);
  if (!resposta.ok) throw new ErroApi(mensagemDeErro(corpo, resposta.status));
  return corpo;
}

export const api = {
  async status(): Promise<StatusApi> {
    const corpo = await obterCorpo("/api/status");
    if (!ehStatus(corpo)) {
      throw new ErroApi("resposta de status inválida");
    }
    return corpo;
  },

  async buscarLinhas(termo: string): Promise<readonly Linha[]> {
    const dados = await obterCorpo(
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

  async posicoes(
    codigoLinha: number,
    opcoes: { readonly sinal?: AbortSignal } = {},
  ): Promise<PosicoesDaLinha> {
    const init =
      opcoes.sinal !== undefined ? { signal: opcoes.sinal } : undefined;
    const corpo = await obterCorpo(`/api/posicoes/${codigoLinha}`, init);
    const dados = paraPosicoesDoCliente(corpo);
    if (dados === null) {
      throw new ErroApi("resposta de posições inválida");
    }
    return dados;
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
