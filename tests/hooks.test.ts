import { test } from "node:test";
import assert from "node:assert/strict";

import {
  avisosDeRodada,
  faseDoCiclo,
  rotaResolvida,
  tituloAtualizacao,
} from "../client/hooks.ts";

test("falha de trajeto não marca a rota como resolvida", () => {
  assert.equal(
    rotaResolvida({ dados: null, erro: "GeoSampa indisponível" }),
    false,
  );
  assert.equal(rotaResolvida(undefined), false);
  assert.equal(
    rotaResolvida({
      dados: {
        trechos: [[
          { lat: -23.55, lng: -46.63 },
          { lat: -23.56, lng: -46.64 },
        ]],
      },
      erro: null,
    }),
    true,
  );
});

test("fase do ciclo reflete o estado do polling", () => {
  assert.equal(faseDoCiclo(undefined), "aguardando");
  assert.equal(
    faseDoCiclo({
      dados: null,
      erro: null,
      atualizadoEm: null,
      consultando: true,
    }),
    "aguardando",
  );
  assert.equal(
    faseDoCiclo({
      dados: { horario: "12:00", veiculos: [] },
      erro: null,
      atualizadoEm: new Date(2026, 0, 1, 8, 0, 0),
      consultando: false,
    }),
    "ao-vivo",
  );
  assert.equal(
    faseDoCiclo({
      dados: { horario: "12:00", veiculos: [] },
      erro: null,
      atualizadoEm: new Date(2026, 0, 1, 8, 0, 0),
      consultando: true,
    }),
    "atualizando",
  );
  assert.equal(
    faseDoCiclo({
      dados: { horario: "12:00", veiculos: [] },
      erro: "SPTrans indisponível",
      atualizadoEm: new Date(2026, 0, 1, 8, 0, 0),
      consultando: false,
    }),
    "com-erro",
  );
});

test("título da última atualização formata hora:minuto:segundo com zeros", () => {
  assert.equal(tituloAtualizacao(null), null);
  assert.equal(
    tituloAtualizacao(new Date(2026, 0, 15, 7, 5, 3)),
    "atualizado às 07:05:03",
  );
});

test("avisos de rodada anunciam primeira leitura, cruzamento de zero e salto grande", () => {
  const primeira = avisosDeRodada(
    new Map(),
    [{ id: 10, letreiro: "8000-10", total: 4 }],
  );
  assert.deepEqual(
    primeira.avisos.map((a) => a.texto),
    ["8000-10 · 4 ônibus em circulação"],
  );

  const continua = new Map([[10, 4]]);
  const rotineiro = avisosDeRodada(continua, [
    { id: 10, letreiro: "8000-10", total: 3 },
  ]);
  assert.equal(rotineiro.avisos.length, 0);

  const saltou = avisosDeRodada(continua, [
    { id: 10, letreiro: "8000-10", total: 7 },
  ]);
  assert.deepEqual(
    saltou.avisos.map((a) => a.texto),
    ["8000-10 · +3 ônibus"],
  );
});

test("avisos de rodada ficam quietos em vibração de ±1 e anunciam frota zerando", () => {
  const antes = new Map<number, number | null>([[20, 2]]);
  const vibra = avisosDeRodada(antes, [
    { id: 20, letreiro: "N106-11", total: 1 },
  ]);
  assert.equal(vibra.avisos.length, 0);

  const zera = avisosDeRodada(vibra.proxima, [
    { id: 20, letreiro: "N106-11", total: 0 },
  ]);
  assert.deepEqual(
    zera.avisos.map((a) => a.texto),
    ["N106-11 · nenhum ônibus circulando agora"],
  );

  const volta = avisosDeRodada(zera.proxima, [
    { id: 20, letreiro: "N106-11", total: 1 },
  ]);
  assert.deepEqual(
    volta.avisos.map((a) => a.texto),
    ["N106-11 · +1 ônibus"],
  );
});

test("avisos de rodada ignoram leitura sem dado mas mantêm histórico da linha", () => {
  const antes = new Map<number, number | null>([[30, null]]);
  const resultado = avisosDeRodada(antes, [
    { id: 30, letreiro: "6006-10", total: null },
    { id: 31, letreiro: "8000-10", total: 2 },
  ]);
  assert.equal(resultado.proxima.get(30), null);
  assert.equal(resultado.proxima.get(31), 2);
});

test("linha fora das amostras sai do histórico e volta como primeira leitura", () => {
  const antes = new Map<number, number | null>([
    [7, 3],
    [8, 2],
  ]);
  const semSete = avisosDeRodada(antes, [{ id: 8, letreiro: "8000-10", total: 2 }]);
  assert.equal(semSete.proxima.has(7), false);

  const deVolta = avisosDeRodada(semSete.proxima, [
    { id: 7, letreiro: "N106-11", total: 3 },
  ]);
  assert.deepEqual(
    deVolta.avisos.map((a) => a.texto),
    ["N106-11 · 3 ônibus em circulação"],
  );
});
