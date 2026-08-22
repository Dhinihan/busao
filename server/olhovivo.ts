import { lerEstado } from "./token-store.ts";

const API_BASE = "https://api.olhovivo.sptrans.com.br/v2.1";

export type Linha = {
  readonly id: number;
  readonly letreiro: string;
  readonly descricao: string;
};

export type PosicaoVeiculo = {
  readonly prefixo: string;
  readonly lat: number;
  readonly lng: number;
  readonly acessivel: boolean;
};

export type PosicoesDaLinha = {
  readonly horario: string;
  readonly veiculos: readonly PosicaoVeiculo[];
};

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

let sessao: Sessao | null = null;

let aoAutenticar: ((token: string) => void) | null = null;

export function definirAoAutenticar(
  fn: ((token: string) => void) | null,
): void {
  aoAutenticar = fn;
}

export function limparSessao(): void {
  sessao = null;
}

function campoDe(objeto: object, chave: string): unknown {
  if (!(chave in objeto)) return undefined;
  return Reflect.get(objeto, chave);
}

function ehTexto(valor: unknown): valor is string {
  return typeof valor === "string";
}

function ehNumero(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

async function entrar(token: string): Promise<Sessao> {
  let resposta: Response;
  try {
    resposta = await fetch(
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
  const cookieCru = resposta.headers.getSetCookie()[0];
  const cookie =
    cookieCru === undefined ? undefined : cookieCru.split(";")[0]?.trim();
  if (cookie === undefined || cookie === "") {
    throw new ErroOlhoVivo("autenticação não devolveu cookie de sessão");
  }
  aoAutenticar?.(token);
  return { token, cookie };
}

async function requisitar(caminho: string): Promise<unknown> {
  const estado = await lerEstado();
  const token = estado.token;
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
      resposta = await fetch(`${API_BASE}${caminho}`, {
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

export async function validarToken(token: string): Promise<boolean> {
  try {
    sessao = await entrar(token);
    return true;
  } catch (erro) {
    if (erro instanceof TokenInvalidoError) return false;
    throw erro;
  }
}

export function paraLinha(bruto: unknown): Linha | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const id = campoDe(bruto, "cl");
  const parte1 = campoDe(bruto, "lt");
  const parte2 = campoDe(bruto, "tl");
  const primario = campoDe(bruto, "tp");
  const secundario = campoDe(bruto, "ts");
  if (!ehNumero(id) || !ehTexto(parte1)) return null;
  const sufixo = ehNumero(parte2)
    ? String(parte2)
    : ehTexto(parte2)
      ? parte2
      : "";
  const trechos = [primario, secundario].filter(ehTexto).filter((t) => t !== "");
  return {
    id,
    letreiro: sufixo === "" ? parte1 : `${parte1}-${sufixo}`,
    descricao: trechos.join(" − "),
  };
}

export async function buscarLinhas(termo: string): Promise<readonly Linha[]> {
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
}

export function paraPosicoes(bruto: unknown): PosicoesDaLinha | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const horarioBruto = campoDe(bruto, "hr");
  const veiculosBrutos = campoDe(bruto, "vs");
  if (!Array.isArray(veiculosBrutos)) return null;
  const veiculos: PosicaoVeiculo[] = [];
  for (const item of veiculosBrutos) {
    if (typeof item !== "object" || item === null) continue;
    const prefixo = campoDe(item, "p");
    const lat = campoDe(item, "py");
    const lng = campoDe(item, "px");
    if (!ehTexto(prefixo) || !ehNumero(lat) || !ehNumero(lng)) continue;
    veiculos.push({
      prefixo,
      lat,
      lng,
      acessivel: campoDe(item, "a") === true,
    });
  }
  return { horario: ehTexto(horarioBruto) ? horarioBruto : "", veiculos };
}

export async function posicoesDaLinha(codigoLinha: number): Promise<PosicoesDaLinha> {
  const dados = await requisitar(`/Posicao/Linha?codigoLinha=${codigoLinha}`);
  const posicoes = paraPosicoes(dados);
  if (posicoes === null) {
    throw new ErroOlhoVivo("resposta inesperada de posições");
  }
  return posicoes;
}
