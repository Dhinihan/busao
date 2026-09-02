import { paraLinha, paraPosicoes, paraPrevisaoParada } from "../shared/parsers.ts";
import type { Linha, PosicoesDaLinha, PrevisaoParada } from "../shared/tipos.ts";

const API_BASE = "https://api.olhovivo.sptrans.com.br/v2.1";

export class ErroOlhoVivo extends Error {}

export class TokenInvalidoError extends ErroOlhoVivo {
  constructor() {
    super("token recusado pela SPTrans");
  }
}

export type Sessao = {
  readonly token: string;
  readonly cookie: string;
};

export function interpretarSessao(valor: unknown): Sessao | null {
  let candidato: unknown = valor;
  if (typeof candidato === "string") {
    try {
      candidato = JSON.parse(candidato) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof candidato !== "object" || candidato === null) return null;
  if (
    !("token" in candidato) ||
    !("cookie" in candidato) ||
    typeof candidato.token !== "string" ||
    typeof candidato.cookie !== "string"
  ) {
    return null;
  }
  return { token: candidato.token, cookie: candidato.cookie };
}

export type ClienteOlhoVivo = {
  readonly buscarLinhas: (termo: string) => Promise<readonly Linha[]>;
  readonly posicoesDaLinha: (codigoLinha: number) => Promise<PosicoesDaLinha>;
  readonly previsaoDaParada: (codigoParada: number) => Promise<PrevisaoParada>;
  readonly validar: (token: string) => Promise<boolean>;
  readonly descartarSessao: () => void;
};

function campoCookie(resposta: Response): string | null {
  const comGetSetCookie = resposta.headers as Headers & {
    getSetCookie?: () => string[];
  };
  const brutos =
    typeof comGetSetCookie.getSetCookie === "function"
      ? comGetSetCookie.getSetCookie()
      : [];
  const direto = campoDeTexto(brutos[0]);
  if (direto !== null) return direto;
  const combinado = resposta.headers.get("set-cookie");
  return campoDeTexto(combinado === null ? undefined : combinado.split(/,(?=[^;,]+?=)/)[0]);
}

function campoDeTexto(bruto: string | undefined): string | null {
  const cookie = bruto === undefined ? undefined : bruto.split(";")[0]?.trim();
  return cookie === undefined || cookie === "" ? null : cookie;
}

type ClienteOlhoVivoOpcoes = {
  readonly obterToken: () => Promise<string | null>;
  readonly buscar?: typeof fetch;
  readonly aoAutenticar?: (token: string) => void;
  readonly lerSessao?: () => Promise<unknown>;
  readonly gravarSessao?: (sessao: Sessao) => Promise<Sessao | null>;
};

export function criarClienteOlhoVivo(opcoes: ClienteOlhoVivoOpcoes): ClienteOlhoVivo {
  const buscar = opcoes.buscar ?? fetch;
  let sessaoMemoria: Sessao | null = null;

  async function sessaoAtual(
    cookiesRejeitados: ReadonlySet<string>,
  ): Promise<Sessao | null> {
    const sessao =
      opcoes.lerSessao === undefined
        ? sessaoMemoria
        : interpretarSessao(await opcoes.lerSessao());
    return sessao !== null && !cookiesRejeitados.has(sessao.cookie)
      ? sessao
      : null;
  }

  async function guardarSessao(sessao: Sessao): Promise<Sessao> {
    const adotada = await opcoes.gravarSessao?.(sessao);
    const vigente = adotada ?? sessao;
    sessaoMemoria = vigente;
    return vigente;
  }

  function descartarSessaoAtual(): void {
    sessaoMemoria = null;
  }

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
    const cookie = campoCookie(resposta);
    if (cookie === null) {
      throw new ErroOlhoVivo("autenticação não devolveu cookie de sessão");
    }
    opcoes.aoAutenticar?.(token);
    return { token, cookie };
  }

  async function requisitar(caminho: string): Promise<unknown> {
    const token = await opcoes.obterToken();
    if (token === null) throw new ErroOlhoVivo("token da SPTrans não configurado");

    const cookiesRejeitados = new Set<string>();
    for (let tentativa = 0; tentativa < 2; tentativa += 1) {
      const existente = await sessaoAtual(cookiesRejeitados);
      const reutilizada = existente !== null && existente.token === token;
      let atual: Sessao;
      if (reutilizada) {
        atual = existente;
      } else {
        atual = await entrar(token);
        const vigente = await guardarSessao(atual);
        if (!cookiesRejeitados.has(vigente.cookie)) {
          atual = vigente;
        } else {
          sessaoMemoria = atual;
        }
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
        cookiesRejeitados.add(atual.cookie);
        descartarSessaoAtual();
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

    async previsaoDaParada(codigoParada: number): Promise<PrevisaoParada> {
      const dados = await requisitar(
        `/Previsao/Parada?codigoParada=${codigoParada}`,
      );
      const previsao = paraPrevisaoParada(dados);
      if (previsao === null) {
        throw new ErroOlhoVivo("resposta inesperada de previsão");
      }
      return previsao;
    },

    async validar(token: string): Promise<boolean> {
      try {
        await guardarSessao(await entrar(token));
        return true;
      } catch (erro) {
        if (erro instanceof TokenInvalidoError) return false;
        throw erro;
      }
    },

    descartarSessao(): void {
      descartarSessaoAtual();
    },
  };
}
