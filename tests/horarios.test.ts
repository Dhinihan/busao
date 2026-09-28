import assert from "node:assert/strict";
import { test } from "node:test";
import {
  minutosAte,
  minutosDaPartida,
  proximasPartidas,
  tipoDiaDe,
  ultimasPartidas,
} from "../client/horarios.ts";

test("tipoDiaDe separa dia útil, sábado e domingo", () => {
  assert.equal(tipoDiaDe(new Date(2026, 7, 24)), "util");
  assert.equal(tipoDiaDe(new Date(2026, 7, 28)), "util");
  assert.equal(tipoDiaDe(new Date(2026, 7, 29)), "sab");
  assert.equal(tipoDiaDe(new Date(2026, 7, 30)), "dom");
});

test("minutosDaPartida valida HH:MM", () => {
  assert.equal(minutosDaPartida("04:40"), 280);
  assert.equal(minutosDaPartida("23:59"), 1439);
  assert.equal(minutosDaPartida("00:00"), 0);
  assert.equal(minutosDaPartida("24:00"), null);
  assert.equal(minutosDaPartida("12:60"), null);
  assert.equal(minutosDaPartida("12:34:56"), null);
  assert.equal(minutosDaPartida("xx:yy"), null);
  assert.equal(minutosDaPartida("7"), null);
});

test("proximasPartidas filtra o passado e ordena o futuro", () => {
  const agora = 18 * 60 + 43;
  assert.deepEqual(
    proximasPartidas(["19:00", "04:40", "18:50", "18:30", "22:10"], agora),
    ["18:50", "19:00", "22:10"],
  );
});

test("proximasPartidas descarta horários inválidos e não muta a entrada", () => {
  const originais = ["xx:yy", "10:00", "bom-dia"];
  assert.deepEqual(proximasPartidas(originais, 9 * 60), ["10:00"]);
  assert.deepEqual(originais, ["xx:yy", "10:00", "bom-dia"]);
});

test("proximasPartidas devolve vazio quando o dia já acabou", () => {
  assert.deepEqual(proximasPartidas(["04:00", "05:10"], 23 * 60 + 50), []);
});

test("ultimasPartidas devolve as n mais recentes já saídas, em ordem", () => {
  const agora = 18 * 60 + 43;
  assert.deepEqual(
    ultimasPartidas(["18:50", "05:00", "18:30", "17:00", "18:10", "16:00"], agora, 3),
    ["17:00", "18:10", "18:30"],
  );
});

test("ultimasPartidas devolve menos de n quando há poucas", () => {
  assert.deepEqual(ultimasPartidas(["xx:yy", "06:00", "19:00"], 7 * 60, 3), ["06:00"]);
});

test("ultimasPartidas devolve vazio sem passadas, sem partidas ou com n zero", () => {
  assert.deepEqual(ultimasPartidas(["06:00"], 5 * 60, 3), []);
  assert.deepEqual(ultimasPartidas([], 12 * 60, 3), []);
  assert.deepEqual(ultimasPartidas(["05:00", "06:00"], 12 * 60, 0), []);
  assert.deepEqual(ultimasPartidas(["05:00", "06:00"], 12 * 60, -1), []);
});

test("a partida no minuto atual conta como próxima, não como passada", () => {
  const agora = 10 * 60;
  assert.deepEqual(proximasPartidas(["09:50", "10:00"], agora), ["10:00"]);
  assert.deepEqual(ultimasPartidas(["09:50", "10:00"], agora, 3), ["09:50"]);
});

test("minutosAte conta só para partidas futuras do mesmo dia", () => {
  assert.equal(minutosAte("23:59", 23 * 60 + 50), 9);
  assert.equal(minutosAte("00:10", 23 * 60 + 50), -1420);
});
