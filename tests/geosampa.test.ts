import assert from "node:assert/strict";
import { test } from "node:test";

import {
  criarClienteGeoSampa,
  ErroGeoSampa,
} from "../server/geosampa.ts";

const GEOMETRIA = {
  type: "FeatureCollection",
  features: [
    {
      geometry: {
        type: "LineString",
        coordinates: [
          [-46.63, -23.55],
          [-46.64, -23.56],
        ],
      },
    },
    {
      geometry: {
        type: "LineString",
        coordinates: [
          [-46.65, -23.57],
          [-46.66, -23.58],
        ],
      },
    },
  ],
};

test("cliente GeoSampa busca as duas direções pela linha", async () => {
  let chamada = "";
  const cliente = criarClienteGeoSampa({
    buscar: async (url) => {
      chamada = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => GEOMETRIA,
      } as unknown as Response;
    },
  });

  const rota = await cliente.rotaDaLinha("8700-10");
  const parametros = new URL(chamada).searchParams;

  assert.equal(parametros.get("typeName"), "geoportal:linha_onibus");
  assert.equal(parametros.get("srsName"), "EPSG:4326");
  assert.equal(
    parametros.get("CQL_FILTER"),
    "cd_linha_geometria='8700-10'",
  );
  assert.equal(rota.trechos.length, 2);
  assert.equal(rota.trechos[0]?.length, 2);
});

test("cliente GeoSampa rejeita resposta sem geometria", async () => {
  const cliente = criarClienteGeoSampa({
    buscar: async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({ features: [] }),
      }) as unknown as Response,
  });

  await assert.rejects(cliente.rotaDaLinha("8700-10"), (erro: unknown) => {
    assert.ok(erro instanceof ErroGeoSampa);
    assert.equal(erro.message, "resposta inesperada de trajeto");
    return true;
  });
});

test("cliente GeoSampa reutiliza a geometria dentro do TTL", async () => {
  let chamadas = 0;
  let agora = 100;
  const cliente = criarClienteGeoSampa({
    ttlCacheMs: 50,
    agora: () => agora,
    buscar: async () => {
      chamadas += 1;
      return {
        ok: true,
        status: 200,
        json: async () => GEOMETRIA,
      } as unknown as Response;
    },
  });

  await cliente.rotaDaLinha("8700-10");
  await cliente.rotaDaLinha(" 8700-10 ");
  assert.equal(chamadas, 1);

  agora += 50;
  await cliente.rotaDaLinha("8700-10");
  assert.equal(chamadas, 2);
});

test("cliente GeoSampa deduplica chamadas simultâneas", async () => {
  let chamadas = 0;
  const cliente = criarClienteGeoSampa({
    buscar: async () => {
      chamadas += 1;
      await new Promise((resolver) => setTimeout(resolver, 1));
      return {
        ok: true,
        status: 200,
        json: async () => GEOMETRIA,
      } as unknown as Response;
    },
  });

  await Promise.all([
    cliente.rotaDaLinha("8700-10"),
    cliente.rotaDaLinha("8700-10"),
  ]);
  assert.equal(chamadas, 1);
});
