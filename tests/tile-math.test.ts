import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TILE_SIZE,
  deslocarMundo,
  enquadrarPontos,
  mundoEmPixel,
  pixelEmMundo,
  pontoParaPixelDeTela,
  tilesVisiveis,
} from "../shared/tile-math.ts";

const SAO_PAULO = { lat: -23.5505, lng: -46.6333 };

test("projeção é redonda em vários pontos e zooms", () => {
  const pontos = [
    SAO_PAULO,
    { lat: 0, lng: 0 },
    { lat: 85.05, lng: 179.9 },
    { lat: -85.05, lng: -179.9 },
    { lat: 51.5, lng: -0.12 },
  ];
  for (const zoom of [0, 1, 5, 12, 18]) {
    for (const ponto of pontos) {
      const pixel = mundoEmPixel(ponto, zoom);
      const volta = pixelEmMundo(pixel, zoom);
      assert.ok(Math.abs(volta.lat - ponto.lat) < 1e-6, `lat z${zoom}`);
      assert.ok(Math.abs(volta.lng - ponto.lng) < 1e-6, `lng z${zoom}`);
    }
  }
});

test("zoom 0 cobre o mundo com um único tile", () => {
  const tiles = tilesVisiveis({
    centro: { lat: 0, lng: 0 },
    zoom: 0,
    largura: TILE_SIZE,
    altura: TILE_SIZE,
  });
  assert.equal(tiles.length, 1);
  const unica = tiles[0];
  assert.ok(unica !== undefined);
  assert.deepEqual(
    { z: unica.z, x: unica.x, y: unica.y },
    { z: 0, x: 0, y: 0 },
  );
});

test("bordas produzem os tiles vizinhos alinhados", () => {
  const largura = TILE_SIZE * 3;
  const altura = TILE_SIZE * 2;
  const tiles = tilesVisiveis({
    centro: { lat: 10, lng: 10 },
    zoom: 3,
    largura,
    altura,
  });
  const total = Math.pow(2, 3);
  for (const tile of tiles) {
    assert.ok(tile.x >= 0 && tile.x < total);
    assert.ok(tile.y >= 0 && tile.y < total);
    assert.ok(tile.esquerda > -TILE_SIZE && tile.esquerda < largura);
    assert.ok(tile.topo > -TILE_SIZE && tile.topo < altura);
  }
  assert.equal(tiles.length, 12);
});

test("arrasto de pixels converte de volta no mesmo lugar", () => {
  const movido = deslocarMundo(SAO_PAULO, -120, 80, 14);
  const origem = mundoEmPixel(SAO_PAULO, 14);
  const destino = mundoEmPixel(movido, 14);
  assert.ok(Math.abs(destino.x - (origem.x - 120)) < 1e-6);
  assert.ok(Math.abs(destino.y - (origem.y + 80)) < 1e-6);
});

test("marcador fica dentro da tela quando próximo do centro", () => {
  const tela = pontoParaPixelDeTela(SAO_PAULO, {
    centro: SAO_PAULO,
    zoom: 13,
    largura: 375,
    altura: 500,
  });
  assert.ok(Math.abs(tela.x - 375 / 2) < 1e-6);
  assert.ok(Math.abs(tela.y - 500 / 2) < 1e-6);
});

test("enquadrar escolhe zoom que cabe na tela e centra o grupo", () => {
  const grupo = [
    { lat: -23.54, lng: -46.63 },
    { lat: -23.56, lng: -46.61 },
  ];
  const quadro = enquadrarPontos(grupo, { largura: 800, altura: 600 });
  assert.ok(quadro.zoom >= 0 && quadro.zoom <= 15);
  assert.ok(Math.abs(quadro.lat - (-23.55)) < 1e-9);
  assert.ok(Math.abs(quadro.lng - (-46.62)) < 1e-9);

  const apertado = enquadrarPontos(grupo, { largura: 100, altura: 100 });
  assert.ok(apertado.zoom <= quadro.zoom);
});

test("enquadrar sem pontos devolve São Paulo padrão", () => {
  const quadro = enquadrarPontos([], { largura: 800, altura: 600 });
  assert.equal(quadro.zoom, 12);
});
