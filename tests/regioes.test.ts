import assert from "node:assert/strict";
import { test } from "node:test";
import { corDoLetreiro, regiaoDoLetreiro } from "../shared/regioes.ts";

test("primeiro dígito do letreiro identifica a área de origem", () => {
  assert.deepEqual(regiaoDoLetreiro("8000-10"), { nome: "Oeste", cor: "#ef6c00" });
  assert.deepEqual(regiaoDoLetreiro("209P-10"), { nome: "Norte", cor: "#1e3a8a" });
});

test("centro é região neutra", () => {
  assert.deepEqual(regiaoDoLetreiro("917-M-10"), {
    nome: "Central",
    cor: "#9aa0a6",
  });
});

test("noturnas usam o dígito após o N", () => {
  assert.deepEqual(regiaoDoLetreiro("N106-11"), { nome: "Noroeste", cor: "#7cb342" });
  assert.deepEqual(regiaoDoLetreiro("N306-11"), { nome: "Nordeste", cor: "#fdd835" });
});

test("letreiro fora do padrão devolve null", () => {
  assert.equal(regiaoDoLetreiro(""), null);
  assert.equal(regiaoDoLetreiro("AB123"), null);
  assert.equal(regiaoDoLetreiro("N"), null);
});

test("corDoLetreiro prefere a cor oficial do GTFS à paleta por área", () => {
  // Valores reais do feed: 8000 é verde (#509E2F) no routes.txt, enquanto a
  // heurística de área devolveria o laranja do Oeste (#ef6c00).
  assert.equal(corDoLetreiro("8000-10"), "#509E2F");
  assert.equal(corDoLetreiro("N106-11"), "#509E2F");
  assert.notEqual(corDoLetreiro("8000-10"), regiaoDoLetreiro("8000-10")?.cor);
});

test("corDoLetreiro cai na paleta por área fora do feed e em null fora do padrão", () => {
  assert.equal(corDoLetreiro("9999-10"), regiaoDoLetreiro("9999-10")?.cor);
  assert.equal(corDoLetreiro("9999-10"), "#9aa0a6");
  assert.equal(corDoLetreiro("AB123"), null);
});
