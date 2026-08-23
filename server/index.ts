import { capsule, endpoint, json } from "lakebed/server";
import {
  criarClienteOlhoVivo,
  ErroOlhoVivo,
  type ClienteOlhoVivo,
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

const logMudo: LogLakebed = { info: () => {} };

let tokenAtual: string | null = null;
let logAtual: LogLakebed = logMudo;

const olhovivo: ClienteOlhoVivo = criarClienteOlhoVivo({
  obterToken: async () => tokenAtual,
  aoAutenticar: () => {
    logAtual.info("olhovivo relogin");
  },
});

const cachePosicoes = criarCachePosicoes({
  buscar: (linhaId) => olhovivo.posicoesDaLinha(linhaId),
  aoRegistrar: (linhaId, resultado) => {
    logAtual.info("cache", { linhaId, resultado });
  },
});

function preparar(ctx: { env: Record<string, string | undefined>; log: LogLakebed }): void {
  const bruto = ctx.env["OLHOVIVO_TOKEN"];
  tokenAtual = bruto === undefined || bruto.trim() === "" ? null : bruto.trim();
  logAtual = ctx.log ?? logMudo;
}

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
