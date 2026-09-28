import assert from "node:assert/strict";
import { test } from "node:test";
import { ehDuploToque, ehToque } from "../shared/toque.ts";

test("toque rápido e parado conta como toque", () => {
  assert.equal(ehToque({ x: 10, y: 10, t: 0 }, { x: 12, y: 11, t: 120 }), true);
});

test("arrastar ou segurar não conta como toque", () => {
  assert.equal(ehToque({ x: 10, y: 10, t: 0 }, { x: 60, y: 10, t: 120 }), false);
  assert.equal(ehToque({ x: 10, y: 10, t: 0 }, { x: 10, y: 10, t: 800 }), false);
});

test("dois toques próximos no tempo e no espaço são duplo toque", () => {
  const primeiro = { x: 100, y: 100, t: 1000 };
  assert.equal(ehDuploToque(primeiro, { x: 108, y: 96, t: 1200 }), true);
});

test("sem toque anterior, muito tempo ou muita distância não é duplo toque", () => {
  const primeiro = { x: 100, y: 100, t: 1000 };
  assert.equal(ehDuploToque(null, primeiro), false);
  assert.equal(ehDuploToque(primeiro, { x: 100, y: 100, t: 1600 }), false);
  assert.equal(ehDuploToque(primeiro, { x: 200, y: 100, t: 1200 }), false);
});
