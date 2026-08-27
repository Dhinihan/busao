import { mensagemDeErro } from "../shared/mensagens.ts";
import {
  ehLinha,
  ehStatus,
  paraPosicoesDoCliente,
  paraRotaDoCliente,
} from "../shared/parsers.ts";
import type {
  Linha,
  PosicoesDaLinha,
  RotaDaLinha,
  StatusApi,
} from "../shared/tipos.ts";

export class ErroApi extends Error {}

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

  async buscarLinhas(
    termo: string,
    opcoes: { readonly sinal?: AbortSignal } = {},
  ): Promise<readonly Linha[]> {
    const init =
      opcoes.sinal !== undefined ? { signal: opcoes.sinal } : undefined;
    const dados = await obterCorpo(
      `/api/linhas?termo=${encodeURIComponent(termo)}`,
      init,
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
    const corpo = await obterCorpo(`/api/posicoes?linha=${codigoLinha}`, init);
    const dados = paraPosicoesDoCliente(corpo);
    if (dados === null) {
      throw new ErroApi("resposta de posições inválida");
    }
    return dados;
  },

  async rota(
    codigoLinha: number,
    letreiro: string,
    opcoes: { readonly sinal?: AbortSignal } = {},
  ): Promise<RotaDaLinha> {
    const init =
      opcoes.sinal !== undefined ? { signal: opcoes.sinal } : undefined;
    const corpo = await obterCorpo(
      `/api/rota?linha=${codigoLinha}&letreiro=${encodeURIComponent(letreiro)}`,
      init,
    );
    const dados = paraRotaDoCliente(corpo);
    if (dados === null) {
      throw new ErroApi("resposta de trajeto inválida");
    }
    return dados;
  },
};
