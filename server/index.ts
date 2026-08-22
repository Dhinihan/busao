import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { linhasDemo, posicoesDemo } from "./demo";
import {
  buscarLinhas,
  ErroOlhoVivo,
  posicoesDaLinha,
  validarToken,
} from "./olhovivo";
import { lerToken, salvarToken } from "./token-store";

const DEMO = process.env["DEMO"] === "1";
const PORTA = Number(process.env["PORT"] ?? 8787);

const app = new Hono();

app.onError((erro, c) => {
  if (erro instanceof ErroOlhoVivo) {
    return c.json({ erro: erro.message }, 502);
  }
  console.error(erro);
  return c.json({ erro: "erro interno do servidor" }, 500);
});

app.get("/api/status", async (c) => {
  if (DEMO) return c.json({ configurado: false, demo: true });
  const token = await lerToken();
  return c.json({ configurado: token !== null, demo: false });
});

app.post("/api/token", async (c) => {
  const corpo: unknown = await c.req.json().catch(() => null);
  const bruto =
    typeof corpo === "object" &&
    corpo !== null &&
    "token" in corpo &&
    typeof corpo.token === "string"
      ? corpo.token.trim()
      : "";
  if (bruto.length < 16) {
    return c.json(
      { erro: "cole o token completo que a SPTrans enviou por e-mail" },
      400,
    );
  }
  let validado = false;
  try {
    validado = await validarToken(bruto);
  } catch {
    validado = false;
  }
  await salvarToken(bruto);
  return c.json({ validado });
});

app.get("/api/linhas", async (c) => {
  const termo = (c.req.query("termo") ?? "").trim();
  if (termo.length < 3) {
    return c.json({ erro: "digite ao menos 3 caracteres" }, 400);
  }
  if (DEMO) {
    const alvo = termo.toLowerCase();
    return c.json(
      linhasDemo().filter(
        (l) =>
          l.letreiro.toLowerCase().includes(alvo) ||
          l.descricao.toLowerCase().includes(alvo),
      ),
    );
  }
  return c.json(await buscarLinhas(termo));
});

app.get("/api/posicoes/:id", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return c.json({ erro: "linha inválida" }, 400);
  }
  if (DEMO) {
    const posicoes = posicoesDemo(id);
    if (posicoes === null) {
      return c.json({ erro: "linha não encontrada" }, 404);
    }
    return c.json(posicoes);
  }
  return c.json(await posicoesDaLinha(id));
});

if (process.env["NODE_ENV"] === "production") {
  app.use("*", serveStatic({ root: "./dist" }));
}

serve(
  { fetch: app.fetch, port: PORTA, hostname: "127.0.0.1" },
  () => {
  console.info(
    `busão · servidor pronto na porta ${PORTA}${DEMO ? " · modo demonstração" : ""}`,
  );
});
