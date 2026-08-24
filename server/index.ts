import { capsule, endpoint, json, string, table } from "lakebed/server";
import {
  criarClienteOlhoVivo,
  ErroOlhoVivo,
  interpretarSessao,
  type Sessao,
} from "./olhovivo.ts";
import { criarClienteGeoSampa, ErroGeoSampa } from "./geosampa.ts";
import { criarEstadoDb, type LinhaEstado } from "./estado-db.ts";
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

const logMudo: LogLakebed = { info: () => {} };

let tokenAtual: string | null = null;
let logAtual: LogLakebed = logMudo;
let estadoDb = criarEstadoDb(null);

function preparar(ctx: {
  env: Record<string, string | undefined>;
  log: LogLakebed;
  db: Parameters<typeof criarEstadoDb>[0];
}): void {
  const bruto = ctx.env["OLHOVIVO_TOKEN"];
  tokenAtual = bruto === undefined || bruto.trim() === "" ? null : bruto.trim();
  logAtual = ctx.log ?? logMudo;
  estadoDb = criarEstadoDb(ctx.db);
}

async function lerSessaoDb(): Promise<Sessao | null> {
  try {
    const linha: LinhaEstado | null = await estadoDb.ler("sessao");
    return linha === null ? null : interpretarSessao(linha.valor);
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : typeof erro;
    logAtual.info("estado: leitura ignorada", { chave: "sessao", tipo: nome });
    return null;
  }
}

async function gravarSessaoDb(sessao: Sessao): Promise<Sessao | null> {
  try {
    const escrito = await estadoDb.gravar("sessao", JSON.stringify(sessao));
    if (escrito.resultado === "criada" || escrito.resultado === "atualizada") {
      logAtual.info("estado: sessao gravada", { resultado: escrito.resultado });
      return null;
    }
    if (escrito.vigente === null) return null;
    const adotavel = interpretarSessao(escrito.vigente);
    if (
      escrito.resultado === "ignorada" &&
      adotavel !== null &&
      adotavel.token === sessao.token
    ) {
      logAtual.info("estado: sessao adotada");
      return adotavel;
    }
    return null;
  } catch (erro) {
    const nome = erro instanceof Error ? erro.name : typeof erro;
    logAtual.info("estado: escrita ignorada", { chave: "sessao", tipo: nome });
    return null;
  }
}

const olhovivo = criarClienteOlhoVivo({
  obterToken: async () => tokenAtual,
  aoAutenticar: () => {
    logAtual.info("olhovivo relogin");
  },
  lerSessao: lerSessaoDb,
  gravarSessao: gravarSessaoDb,
});

const geosampa = criarClienteGeoSampa();

const cachePosicoes = criarCachePosicoes({
  buscar: (linhaId) => olhovivo.posicoesDaLinha(linhaId),
  aoRegistrar: (linhaId, resultado) => {
    logAtual.info("cache", { linhaId, resultado });
  },
});

function respostaDeErro(erro: unknown) {
  if (erro instanceof ErroOlhoVivo || erro instanceof ErroGeoSampa) {
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

    rota: endpoint(
      { method: "GET", path: "/api/rota" },
      async (ctx, req) => {
        preparar(ctx);
        const id = Number(req.query.get("linha") ?? "");
        const letreiro = (req.query.get("letreiro") ?? "").trim();
        if (!idLinhaValido(id) || letreiro === "") {
          return json({ erro: MENSAGEM_LINHA_INVALIDA }, { status: 400 });
        }
        try {
          return json(await geosampa.rotaDaLinha(letreiro));
        } catch (erro) {
          return respostaDeErro(erro);
        }
      },
    ),
  },
});
