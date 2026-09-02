import assert from "node:assert/strict";
import { test } from "node:test";
import { gzipSync } from "node:zlib";
import {
  codificarParadas,
  decodificarParadas,
  decodificarParadasGzip,
  paradasNoQuadro,
} from "../shared/paradas.ts";

const PARADAS = [
  { lat: -23.5505, lng: -46.6333, letreiros: ["8000", "N106"], cp: null },
  { lat: -23.5489, lng: -46.6381, letreiros: ["8000"], cp: 340015329 },
  { lat: -23.5612, lng: -46.6402, letreiros: [], cp: null },
];

test("codificar→decodificar preserva coordenadas e letreiros", () => {
  const asset = codificarParadas("2026-08-24", PARADAS);
  assert.equal(asset.feed_em, "2026-08-24");
  assert.deepEqual([...asset.letreiros], ["8000", "N106"]);
  const decodificadas = decodificarParadas(asset);
  assert.notEqual(decodificadas, null);
  assert.equal(decodificadas!.length, 3);
  // ordenado por lat,lng
  const [sul, meio, norte] = decodificadas!;
  assert.equal(sul!.lat, -23.5612);
  assert.deepEqual([...sul!.letreiros], []);
  assert.deepEqual([...meio!.letreiros], ["8000", "N106"]);
  assert.equal(meio!.cp, null);
  assert.deepEqual([...norte!.letreiros], ["8000"]);
  assert.equal(norte!.cp, 340015329);
  assert.ok(Math.abs(norte!.lng - -46.6381) < 1e-5);
});

test("cp sobrevive ao ciclo somente quando existe", () => {
  const semCp = decodificarParadas(codificarParadas("2026-08-24", [PARADAS[0]!]));
  assert.equal(semCp![0]!.cp, null);
  assert.ok(!("c" in codificarParadas("2026-08-24", [PARADAS[0]!])));
  const comCp = decodificarParadas(codificarParadas("2026-08-24", [PARADAS[1]!]));
  assert.equal(comCp![0]!.cp, 340015329);
});

test("decodificador rejeita asset malformado", () => {
  assert.equal(decodificarParadas(null), null);
  assert.equal(decodificarParadas("x"), null);
  assert.equal(decodificarParadas({}), null);
  assert.equal(decodificarParadas({ letreiros: [], y: [], x: [], l: [] }), null);
  const asset = codificarParadas("2026-08-24", PARADAS);
  assert.equal(
    decodificarParadas({ ...asset, y: asset.y.slice(0, -1) }),
    null,
  );
  assert.equal(
    decodificarParadas({ ...asset, c: [1] }),
    null,
  );
  assert.equal(
    decodificarParadas({ ...asset, l: ["zzzz,"] }),
    null,
  );
  assert.equal(
    decodificarParadas({ ...asset, y: ["zzz"] }),
    null,
  );
});

test("paradasNoQuadro filtra pelo retângulo", () => {  const decodificadas = decodificarParadas(codificarParadas("2026-08-24", PARADAS))!;
  const centro = decodificadas[2]!;
  const noQuadro = paradasNoQuadro(decodificadas, {
    latMin: centro.lat - 0.001,
    latMax: centro.lat + 0.001,
    lngMin: centro.lng - 0.001,
    lngMax: centro.lng + 0.001,
  });
  assert.equal(noQuadro.length, 1);
  assert.equal(noQuadro[0]!.cp, 340015329);
});

test("decodificarParadasGzip faz o ciclo gzip→base64→paradas", async () => {
  const asset = codificarParadas("2026-08-24", PARADAS);
  const base64 = gzipSync(Buffer.from(JSON.stringify(asset)), { level: 9 }).toString("base64");
  const decodificadas = await decodificarParadasGzip(base64);
  assert.notEqual(decodificadas, null);
  assert.equal(decodificadas!.length, 3);
  assert.equal(decodificadas![2]!.cp, 340015329);
  assert.deepEqual([...decodificadas![1]!.letreiros], ["8000", "N106"]);
});

test("decodificarParadasGzip devolve null para payload corrompido", async () => {
  assert.equal(await decodificarParadasGzip("!!!não-é-base64!!!"), null);
  const mentira = Buffer.from("isso não é gzip").toString("base64");
  assert.equal(await decodificarParadasGzip(mentira), null);
});
