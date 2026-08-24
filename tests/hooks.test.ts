import { test } from "node:test";
import assert from "node:assert/strict";

import { rotaResolvida } from "../client/hooks.ts";

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
