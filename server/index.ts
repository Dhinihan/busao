import { capsule, endpoint, json, string, table } from "lakebed/server";
import {
  criarClienteOlhoVivo,
  ErroOlhoVivo,
  interpretarSessao,
  type Sessao,
} from "./olhovivo.ts";
import { criarCachePosicoes } from "./cache-posicoes.ts";
import {
  MENSAGEM_LINHA_INVALIDA,
  MENSAGEM_TERMO_CURTO,
  idLinhaValido,
  termoValido,
} from "../shared/validadores.ts";

type LogLakebed = {
  info: (mensagem: string, extras?: Record<string, unknown>) => void;
};

type DbEstado = {
  estado: {
    withIndex(
      nome: "por_chave",
      alcance: (q: any) => any,
    ): {
      first(): Promise<any>;
    };
    insert(linha: { chave: string; valor: string }): Promise<any>;
    update(id: unknown, parcial: { valor?: string }): Promise<unknown>;
  };
};

const logMudo: LogLakebed = { info: () => {} };

let tokenAtual: string | null = null;
let logAtual: LogLakebed = logMudo;
let dbAtual: DbEstado | null = null;

function preparar(ctx: {
  env: Record<string, string | undefined>;
  log: LogLakebed;
  db: DbEstado;
}): void {
  const bruto = ctx.env["OLHOVIVO_TOKEN"];
  tokenAtual = bruto === undefined || bruto.trim() === "" ? null : bruto.trim();
  logAtual = ctx.log ?? logMudo;
  dbAtual = ctx.db;
}

async function lerLinha(chave: string): Promise<{ id: unknown; valor: unknown } | null> {
  const db = dbAtual;
  if (db === null) return null;
  return db.estado
    .withIndex("por_chave", (q) => q.eq("chave", chave))
    .first();
}

async function lerSessaoDb(): Promise<Sessao | null> {
  try {
    const linha = await lerLinha("sessao");
    return linha === null ? null : interpretarSessao(linha.valor);
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : typeof erro;
    logAtual.info("estado: leitura ignorada", { chave: "sessao", tipo: nome });
    return null;
  }
}

async function gravarLinha(
  chave: string,
  valor: string,
): Promise<void> {
  const db = dbAtual;
  if (db === null) return;
  try {
    const existente = await lerLinha(chave);
    if (existente === null) {
      await db.estado.insert({ chave, valor });
    } else {
      await db.estado.update(existente.id, { valor });
    }
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : typeof erro;
    logAtual.info("estado: escrita ignorada", { chave, tipo: nome });
  }
}

async function gravarSessaoDb(sessao: Sessao): Promise<void> {
  await gravarLinha("sessao", JSON.stringify(sessao));
}

const olhovivo = criarClienteOlhoVivo({
  obterToken: async () => tokenAtual,
  aoAutenticar: () => {
    logAtual.info("olhovivo relogin");
  },
  lerSessao: lerSessaoDb,
  gravarSessao: gravarSessaoDb,
});

const cachePosicoes = criarCachePosicoes({
  buscar: (linhaId) => olhovivo.posicoesDaLinha(linhaId),
  aoRegistrar: (linhaId, resultado) => {
    logAtual.info("cache", { linhaId, resultado });
  },
});

function respostaDeErro(erro: unknown) {
  if (erro instanceof ErroOlhoVivo) {
    return json({ erro: erro.message }, { status: 502 });
  }
  const nome = erro instanceof Error ? erro.name : typeof erro;
  const mensagem = erro instanceof Error ? erro.message : String(erro);
  logAtual.info("erro interno", { tipo: nome, mensagem });
  return json({ erro: "erro interno do servidor" }, { status: 500 });
}

export default capsule({
  name: "busao",
  schema: {
    estado: table({
      chave: string(),
      valor: string(),
    }).index("por_chave", ["chave"]),
  },
  endpoints: {
    status: endpoint({ method: "GET", path: "/api/status" }, async (ctx) => {
      preparar(ctx);
      return json({ configurado: tokenAtual !== null });
    }),

    linhas: endpoint(
      { method: "GET", path: "/api/linhas" },
      async (ctx, req) => {
        preparar(ctx);
        const termo = (req.query.get("termo") ?? "").trim();
        if (!termoValido(termo)) {
          return json({ erro: MENSAGEM_TERMO_CURTO }, { status: 400 });
        }
        try {
          return json(await olhovivo.buscarLinhas(termo));
        } catch (erro) {
          return respostaDeErro(erro);
        }
      },
    ),

    posicoes: endpoint(
      { method: "GET", path: "/api/posicoes" },
      async (ctx, req) => {
        preparar(ctx);
        const id = Number(req.query.get("linha") ?? "");
        if (!idLinhaValido(id)) {
          return json({ erro: MENSAGEM_LINHA_INVALIDA }, { status: 400 });
        }
        try {
          return json(await cachePosicoes.obter(id));
        } catch (erro) {
          return respostaDeErro(erro);
        }
      },
    ),
  },
});
