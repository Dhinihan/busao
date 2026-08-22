import type {
  Linha,
  PosicaoVeiculo,
  PosicoesDaLinha,
  StatusApi,
} from "./types";

export class ErroApi extends Error {}

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

function ehStatus(valor: unknown): valor is StatusApi {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "configurado" in valor &&
    typeof valor.configurado === "boolean" &&
    "demo" in valor &&
    typeof valor.demo === "boolean" &&
    "validado" in valor &&
    typeof valor.validado === "boolean"
  );
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

function paraPosicoes(bruto: unknown): PosicoesDaLinha | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  if (!("vs" in bruto) || !Array.isArray(bruto.vs)) return null;
  const veiculos: PosicaoVeiculo[] = [];
  for (const item of bruto.vs) {
    if (typeof item !== "object" || item === null) continue;
    if (!("p" in item) || typeof item.p !== "string") continue;
    if (!("py" in item) || typeof item.py !== "number") continue;
    if (!("px" in item) || typeof item.px !== "number") continue;
    const acessivel = "a" in item && item.a === true;
    veiculos.push({ prefixo: item.p, lat: item.py, lng: item.px, acessivel });
  }
  const horario = "hr" in bruto && typeof bruto.hr === "string" ? bruto.hr : "";
  return { horario, veiculos };
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
    const dados = paraPosicoes(corpo);
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
