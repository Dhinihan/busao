import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { ErroOlhoVivo, buscarLinhas, limparSessao } from "../server/olhovivo.ts";

const TOKEN_FIXO = "token-de-teste";

type Chamada = { readonly metodo: string; readonly caminho: string };

function respostaFake(opcoes: {
  status: number;
  corpo?: unknown;
  comCookie?: boolean;
}): Response {
  const { status, corpo = "", comCookie = false } = opcoes;
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => String(corpo),
    json: async () => corpo,
    headers: {
      getSetCookie: () =>
        comCookie ? ["apiCredentials=falso; path=/; HttpOnly"] : [],
    },
  } as unknown as Response;
}

function loginOk(): Response {
  return respostaFake({ status: 200, corpo: "true", comCookie: true });
}

function dados404(): Response {
  return respostaFake({ status: 404, corpo: { Message: "No HTTP resource" } });
}

function dados200(): Response {
  return respostaFake({
    status: 200,
    corpo: [
      { cl: 2586, lc: true, lt: "6036", sl: 1, tl: 51, tp: "HOSP. CAMPO LIMPO", ts: "JD. MACEDÔNIA" },
    ],
  });
}

function dados401(): Response {
  return respostaFake({ status: 401, corpo: "" });
}

let chamadas: Chamada[] = [];
let fila: Response[] = [];
const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  process.env["OLHOVIVO_TOKEN"] = TOKEN_FIXO;
  limparSessao();
  chamadas = [];
  fila = [];
  globalThis.fetch = (async (
    entrada: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const url = new URL(String(entrada));
    chamadas.push({
      metodo: init?.method ?? "GET",
      caminho: `${url.pathname}${url.search}`,
    });
    const proxima = fila.shift();
    if (proxima === undefined) {
      throw new Error(`fetch inesperado: ${init?.method ?? "GET"} ${url.pathname}`);
    }
    return proxima;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
  delete process.env["OLHOVIVO_TOKEN"];
  limparSessao();
});

test("404 em sessão antiga re-autentica e refaz a chamada", async () => {
  fila.push(loginOk(), dados200(), dados404(), loginOk(), dados200());

  const primeiras = await buscarLinhas("Campo");
  assert.equal(primeiras.length, 1);

  const segundas = await buscarLinhas("Campo");
  assert.equal(segundas.length, 1);
  assert.equal(segundas[0]?.id, 2586);

  assert.deepEqual(chamadas, [
    { metodo: "POST", caminho: "/v2.1/Login/Autenticar?token=token-de-teste" },
    { metodo: "GET", caminho: "/v2.1/Linha/Buscar?termosBusca=Campo" },
    { metodo: "GET", caminho: "/v2.1/Linha/Buscar?termosBusca=Campo" },
    { metodo: "POST", caminho: "/v2.1/Login/Autenticar?token=token-de-teste" },
    { metodo: "GET", caminho: "/v2.1/Linha/Buscar?termosBusca=Campo" },
  ]);
});

test("404 em sessão recém-aberta propaga o erro sem novo login", async () => {
  fila.push(loginOk(), dados404());

  await assert.rejects(buscarLinhas("Campo"), (erro: unknown) => {
    assert.ok(erro instanceof ErroOlhoVivo);
    assert.equal(erro.message, "a API da SPTrans respondeu HTTP 404");
    return true;
  });

  assert.deepEqual(chamadas, [
    { metodo: "POST", caminho: "/v2.1/Login/Autenticar?token=token-de-teste" },
    { metodo: "GET", caminho: "/v2.1/Linha/Buscar?termosBusca=Campo" },
  ]);
});

test("401 segue re-autenticando e esgota com sessão expirada", async () => {
  fila.push(loginOk(), dados200(), dados401(), loginOk(), dados401());

  await buscarLinhas("Campo");

  await assert.rejects(buscarLinhas("Campo"), (erro: unknown) => {
    assert.ok(erro instanceof ErroOlhoVivo);
    assert.equal(erro.message, "sessão expirou mesmo após nova autenticação");
    return true;
  });

  assert.deepEqual(chamadas, [
    { metodo: "POST", caminho: "/v2.1/Login/Autenticar?token=token-de-teste" },
    { metodo: "GET", caminho: "/v2.1/Linha/Buscar?termosBusca=Campo" },
    { metodo: "GET", caminho: "/v2.1/Linha/Buscar?termosBusca=Campo" },
    { metodo: "POST", caminho: "/v2.1/Login/Autenticar?token=token-de-teste" },
    { metodo: "GET", caminho: "/v2.1/Linha/Buscar?termosBusca=Campo" },
  ]);
});
