import assert from "node:assert/strict";
import { test } from "node:test";
import { regiaoDoLetreiro } from "../shared/regioes.ts";

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
