import assert from "node:assert/strict";
import { test } from "node:test";
import {
  paraLinha,
  paraPosicoes,
  paraRotaGeoSampa,
} from "../shared/parsers.ts";
import { mensagemDeErro } from "../shared/mensagens.ts";

test("paraLinha mapeia um registro completo", () => {
  assert.deepEqual(
    paraLinha({ cl: 1234, lt: "8000", tl: 10, tp: "Term. A", ts: "Term. B" }),
    { id: 1234, letreiro: "8000-10", descricao: "Term. A", sentido: undefined },
  );
});

test("paraLinha troca o destino conforme o sentido", () => {
  const ida = paraLinha({
    cl: 1877,
    lt: "8700",
    tl: 10,
    sl: 1,
    tp: "PÇA. RAMOS DE AZEVEDO",
    ts: "TERM. CAMPO LIMPO",
  });
  assert.equal(ida?.descricao, "PÇA. RAMOS DE AZEVEDO");
  const volta = paraLinha({
    cl: 34645,
    lt: "8700",
    tl: 10,
    sl: 2,
    tp: "PÇA. RAMOS DE AZEVEDO",
    ts: "TERM. CAMPO LIMPO",
  });
  assert.equal(volta?.descricao, "TERM. CAMPO LIMPO");
});

test("paraLinha extrai o sentido do campo sl", () => {
  const ida = paraLinha({ cl: 1, lt: "8000", tl: 10, sl: 1, tp: "A", ts: "B" });
  assert.equal(ida?.sentido, "ida");
  const volta = paraLinha({ cl: 2, lt: "8000", tl: 10, sl: 2, tp: "A", ts: "B" });
  assert.equal(volta?.sentido, "volta");
  const semSentido = paraLinha({ cl: 3, lt: "8000", tl: 10 });
  assert.equal(semSentido?.sentido, undefined);
});

test("paraLinha aceita tl numérico ou textual", () => {
  const numerico = paraLinha({ cl: 1, lt: "N106", tl: 11, tp: "", ts: "X" });
  assert.equal(numerico?.letreiro, "N106-11");
  const textual = paraLinha({ cl: 2, lt: "917", tl: "M-10", tp: "", ts: "" });
  assert.equal(textual?.letreiro, "917-M-10");
});

test("paraLinha lida com terminais ausentes", () => {
  const linha = paraLinha({ cl: 3, lt: "8000", tl: 10 });
  assert.deepEqual(linha, {
    id: 3,
    letreiro: "8000-10",
    descricao: "",
    sentido: undefined,
  });
});

test("paraLinha devolve nulo em registros inválidos", () => {
  assert.equal(paraLinha(null), null);
  assert.equal(paraLinha("linha"), null);
  assert.equal(paraLinha({ cl: "x", lt: "1", tl: 0, tp: "", ts: "" }), null);
  assert.equal(paraLinha({ lt: "8000" }), null);
});

const VEICULO_VALIDO = {
  p: "12345",
  a: true,
  ta: "2026-08-21T19:00Z",
  py: -23.5505,
  px: -46.6333,
};

test("paraPosicoes mapeia veículos válidos", () => {
  const posicoes = paraPosicoes({
    hr: "19:00",
    vs: [VEICULO_VALIDO],
  });
  assert.deepEqual(posicoes, {
    horario: "19:00",
    veiculos: [
      {
        prefixo: "12345",
        lat: -23.5505,
        lng: -46.6333,
        acessivel: true,
      },
    ],
  });
});

test("paraPosicoes filtra veículos inválidos e marca acessibilidade", () => {
  const posicoes = paraPosicoes({
    hr: "",
    vs: [
      VEICULO_VALIDO,
      { ...VEICULO_VALIDO, a: false },
      { ...VEICULO_VALIDO, py: "quebrado" },
      { ...VEICULO_VALIDO, p: 99 },
      { py: -23, px: -46 },
    ],
  });
  assert.equal(posicoes?.veiculos.length, 2);
  assert.equal(posicoes?.veiculos[1]?.acessivel, false);
});

test("paraPosicoes devolve nulo sem lista de veículos", () => {
  assert.equal(paraPosicoes(null), null);
  assert.equal(paraPosicoes({}), null);
  assert.equal(paraPosicoes({ hr: "19:00", vs: "tudo" }), null);
});

test("paraRotaGeoSampa converte as geometrias e filtra coordenadas inválidas", () => {
  assert.deepEqual(
    paraRotaGeoSampa({
      features: [
        {
          geometry: {
            type: "LineString",
            coordinates: [
              [-46.63, -23.55],
              ["quebrado", -23.56],
              [-46.65, -23.57],
            ],
          },
        },
        {
          geometry: {
            type: "LineString",
            coordinates: [
              [-46.70, -23.60],
              [-46.71, -23.61],
            ],
          },
        },
      ],
    }),
    {
      trechos: [
        [
          { lat: -23.55, lng: -46.63 },
          { lat: -23.57, lng: -46.65 },
        ],
        [
          { lat: -23.60, lng: -46.70 },
          { lat: -23.61, lng: -46.71 },
        ],
      ],
    },
  );
});

test("paraRotaGeoSampa rejeita resposta sem geometrias", () => {
  assert.equal(paraRotaGeoSampa(null), null);
  assert.equal(paraRotaGeoSampa({ features: [] }), null);
});

const MENSAGEM_RECUSA =
  "a SPTrans ainda não ativou essa chave — chaves recém-criadas podem " +
  "levar alguns dias. Tentamos reconectar automaticamente.";

test("mensagemDeErro traduz a recusa conhecida da SPTrans", () => {
  assert.equal(
    mensagemDeErro({ erro: "token recusado pela SPTrans" }, 502),
    MENSAGEM_RECUSA,
  );
});

test("mensagemDeErro repassa outras mensagens do servidor", () => {
  assert.equal(
    mensagemDeErro({ erro: "digite ao menos 3 caracteres" }, 400),
    "digite ao menos 3 caracteres",
  );
});

test("mensagemDeErro cai no genérico quando o corpo não ajuda", () => {
  assert.equal(
    mensagemDeErro(null, 502),
    "falha na comunicação com o servidor (HTTP 502)",
  );
  assert.equal(mensagemDeErro({}, 500), "falha na comunicação com o servidor (HTTP 500)");
});
