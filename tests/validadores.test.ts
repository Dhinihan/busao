import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MENSAGEM_LINHA_INVALIDA,
  MENSAGEM_TERMO_CURTO,
  idLinhaValido,
  termoValido,
} from "../shared/validadores.ts";

test("termo válido exige ao menos 3 caracteres após trim", () => {
  assert.equal(termoValido("8000"), true);
  assert.equal(termoValido("Paulista"), true);
  assert.equal(termoValido(" 800 "), true);
  assert.equal(termoValido("800"), true);
});

test("termo curto ou vazio é rejeitado", () => {
  assert.equal(termoValido(""), false);
  assert.equal(termoValido("  "), false);
  assert.equal(termoValido("80"), false);
  assert.equal(termoValido(" 8 "), false);
});

test("mensagens de validação são as mesmas expostas pela API", () => {
  assert.equal(MENSAGEM_TERMO_CURTO, "digite ao menos 3 caracteres");
  assert.equal(MENSAGEM_LINHA_INVALIDA, "linha inválida");
});

test("id de linha aceita apenas inteiro positivo", () => {
  assert.equal(idLinhaValido(1), true);
  assert.equal(idLinhaValido(2508), true);
  assert.equal(idLinhaValido(Number.MAX_SAFE_INTEGER), true);
});

test("id de linha rejeita zero, negativo, fracionário e NaN", () => {
  assert.equal(idLinhaValido(0), false);
  assert.equal(idLinhaValido(-1), false);
  assert.equal(idLinhaValido(1.5), false);
  assert.equal(idLinhaValido(Number.NaN), false);
  assert.equal(idLinhaValido(Number.POSITIVE_INFINITY), false);
});
