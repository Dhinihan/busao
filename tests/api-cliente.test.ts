import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { ErroApi, api } from "../client/api.ts";

const fetchOriginal = globalThis.fetch;

const RESPOSTA_DO_SERVIDOR = {
  horario: "13:20",
  veiculos: [
    { prefixo: "82418", lat: -23.611, lng: -46.7532, acessivel: true },
  ],
};

let corpo: unknown;
let status = 200;

beforeEach(() => {
  corpo = RESPOSTA_DO_SERVIDOR;
  status = 200;
  globalThis.fetch = (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => corpo,
    }) as unknown as Response) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

test("posições aceita o contrato do servidor (veiculos mapeados)", async () => {
  const posicoes = await api.posicoes(2508);
  assert.equal(posicoes.horario, "13:20");
  assert.equal(posicoes.veiculos.length, 1);
  assert.deepEqual(posicoes.veiculos[0], {
    prefixo: "82418",
    lat: -23.611,
    lng: -46.7532,
    acessivel: true,
  });
});

test("posições aceita lista de veículos vazia", async () => {
  corpo = { horario: "13:20", veiculos: [] };
  const posicoes = await api.posicoes(2508);
  assert.deepEqual(posicoes.veiculos, []);
});

test("posições rejeita payload sem a chave veiculos", async () => {
  corpo = { hr: "13:20", vs: [] };
  await assert.rejects(api.posicoes(2508), (erro: unknown) => {
    assert.ok(erro instanceof ErroApi);
    assert.equal(erro.message, "resposta de posições inválida");
    return true;
  });
});

test("rota aceita o contrato do servidor", async () => {
  corpo = {
    trechos: [
      [
        { lat: -23.611, lng: -46.7532 },
        { lat: -23.612, lng: -46.7542 },
      ],
      [
        { lat: -23.613, lng: -46.7552 },
        { lat: -23.614, lng: -46.7562 },
      ],
    ],
  };
  const rota = await api.rota(2508, "8700-10");
  assert.deepEqual(rota.trechos, [
    [
      { lat: -23.611, lng: -46.7532 },
      { lat: -23.612, lng: -46.7542 },
    ],
    [
      { lat: -23.613, lng: -46.7552 },
      { lat: -23.614, lng: -46.7562 },
    ],
  ]);
});

test("rota rejeita payload sem a chave trechos", async () => {
  corpo = { pontos: [] };
  await assert.rejects(api.rota(2508, "8700-10"), (erro: unknown) => {
    assert.ok(erro instanceof ErroApi);
    assert.equal(erro.message, "resposta de trajeto inválida");
    return true;
  });
});
