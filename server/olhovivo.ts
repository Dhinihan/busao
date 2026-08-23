import type { Linha, PosicoesDaLinha } from "../shared/tipos.ts";
import { paraLinha, paraPosicoes } from "../shared/parsers.ts";

const API_BASE = "https://api.olhovivo.sptrans.com.br/v2.1";

export class ErroOlhoVivo extends Error {}

export class TokenInvalidoError extends ErroOlhoVivo {
  constructor() {
    super("token recusado pela SPTrans");
  }
}

type Sessao = {
  readonly token: string;
  readonly cookie: string;
};

export type ClienteOlhoVivo = {
  readonly buscarLinhas: (termo: string) => Promise<readonly Linha[]>;
  readonly posicoesDaLinha: (codigoLinha: number) => Promise<PosicoesDaLinha>;
  readonly validar: (token: string) => Promise<boolean>;
  readonly descartarSessao: () => void;
};

function campoCookie(bruto: string | undefined): string | null {
  const cookie = bruto === undefined ? undefined : bruto.split(";")[0]?.trim();
  return cookie === undefined || cookie === "" ? null : cookie;
}

export function criarClienteOlhoVivo(opcoes: {
  readonly obterToken: () => Promise<string | null>;
  readonly buscar?: typeof fetch;
  readonly aoAutenticar?: (token: string) => void;
}): ClienteOlhoVivo {
  const buscar = opcoes.buscar ?? fetch;
  let sessao: Sessao | null = null;

  async function entrar(token: string): Promise<Sessao> {
    let resposta: Response;
    try {
      resposta = await buscar(
        `${API_BASE}/Login/Autenticar?token=${encodeURIComponent(token)}`,
        { method: "POST" },
      );
    } catch (causa) {
      throw new ErroOlhoVivo("sem contato com a API da SPTrans", { cause: causa });
    }
    const corpo = (await resposta.text()).trim();
    if (corpo !== "true") {
      if (resposta.ok && corpo === "false") throw new TokenInvalidoError();
      throw new ErroOlhoVivo(`autenticação falhou (HTTP ${resposta.status})`);
    }
    const cookie = campoCookie(
      resposta.headers.getSetCookie()[0] as string | undefined,
    );
    if (cookie === null) {
      throw new ErroOlhoVivo("autenticação não devolveu cookie de sessão");
    }
    opcoes.aoAutenticar?.(token);
    return { token, cookie };
  }

  async function requisitar(caminho: string): Promise<unknown> {
    const token = await opcoes.obterToken();
    if (token === null) throw new ErroOlhoVivo("token da SPTrans não configurado");

    for (let tentativa = 0; tentativa < 2; tentativa += 1) {
      const existente = sessao;
      const reutilizada = existente !== null && existente.token === token;
      let atual: Sessao;
      if (reutilizada) {
        atual = existente;
      } else {
        atual = await entrar(token);
        sessao = atual;
      }
      let resposta: Response;
      try {
        resposta = await buscar(`${API_BASE}${caminho}`, {
          headers: { cookie: atual.cookie },
        });
      } catch (causa) {
        throw new ErroOlhoVivo("sem contato com a API da SPTrans", { cause: causa });
      }
      const sessaoSuspeita =
        resposta.status === 401 ||
        resposta.status === 403 ||
        (resposta.status === 404 && reutilizada);
      if (sessaoSuspeita) {
        sessao = null;
        continue;
      }
      if (!resposta.ok) {
        throw new ErroOlhoVivo(`a API da SPTrans respondeu HTTP ${resposta.status}`);
      }
      return (await resposta.json()) as unknown;
    }
    throw new ErroOlhoVivo("sessão expirou mesmo após nova autenticação");
  }

  return {
    async buscarLinhas(termo: string): Promise<readonly Linha[]> {
      const dados = await requisitar(
        `/Linha/Buscar?termosBusca=${encodeURIComponent(termo)}`,
      );
      if (!Array.isArray(dados)) return [];
      const linhas: Linha[] = [];
      for (const item of dados) {
        const linha = paraLinha(item);
        if (linha !== null) linhas.push(linha);
      }
      return linhas;
    },

    async posicoesDaLinha(codigoLinha: number): Promise<PosicoesDaLinha> {
      const dados = await requisitar(`/Posicao/Linha?codigoLinha=${codigoLinha}`);
      const posicoes = paraPosicoes(dados);
      if (posicoes === null) {
        throw new ErroOlhoVivo("resposta inesperada de posições");
      }
      return posicoes;
    },

    async validar(token: string): Promise<boolean> {
      try {
        sessao = await entrar(token);
        return true;
      } catch (erro) {
        if (erro instanceof TokenInvalidoError) return false;
        throw erro;
      }
    },

    descartarSessao(): void {
      sessao = null;
    },
  };
}
