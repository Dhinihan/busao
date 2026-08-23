export const TILE_SIZE = 256;

export type Ponto = {
  readonly lat: number;
  readonly lng: number;
};

export type Pixel = {
  readonly x: number;
  readonly y: number;
};

const LIMITE_LAT = 85.05112878;

export function mundoEmPixel(ponto: Ponto, zoom: number): Pixel {
  const escala = TILE_SIZE * Math.pow(2, zoom);
  const latLimitada = Math.min(Math.max(ponto.lat, -LIMITE_LAT), LIMITE_LAT);
  const senoLat = Math.sin((latLimitada * Math.PI) / 180);
  return {
    x: ((ponto.lng + 180) / 360) * escala,
    y:
      (0.5 - Math.log((1 + senoLat) / (1 - senoLat)) / (4 * Math.PI)) * escala,
  };
}

export function pixelEmMundo(pixel: Pixel, zoom: number): Ponto {
  const escala = TILE_SIZE * Math.pow(2, zoom);
  const lng = (pixel.x / escala) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * pixel.y) / escala;
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  return { lat, lng };
}

export type TileVisivel = {
  readonly z: number;
  readonly x: number;
  readonly y: number;
  readonly esquerda: number;
  readonly topo: number;
};

export function deslocarMundo(ponto: Ponto, dx: number, dy: number, zoom: number): Ponto {
  const atual = mundoEmPixel(ponto, zoom);
  return pixelEmMundo({ x: atual.x + dx, y: atual.y + dy }, zoom);
}

export function tilesVisiveis(opcoes: {
  readonly centro: Ponto;
  readonly zoom: number;
  readonly largura: number;
  readonly altura: number;
}): readonly TileVisivel[] {
  const { centro, zoom, largura, altura } = opcoes;
  const centroPixel = mundoEmPixel(centro, zoom);
  const bordaEsquerda = centroPixel.x - largura / 2;
  const bordaTopo = centroPixel.y - altura / 2;
  const total = Math.pow(2, zoom);
  const ultimoPixelX = bordaEsquerda + largura - 1e-9;
  const ultimoPixelY = bordaTopo + altura - 1e-9;
  const xInicial = Math.floor(bordaEsquerda / TILE_SIZE);
  const xFinal = Math.floor(ultimoPixelX / TILE_SIZE);
  const yInicial = Math.max(0, Math.floor(bordaTopo / TILE_SIZE));
  const yFinal = Math.min(total - 1, Math.floor(ultimoPixelY / TILE_SIZE));
  const tiles: TileVisivel[] = [];
  for (let y = yInicial; y <= yFinal; y += 1) {
    for (let x = xInicial; x <= xFinal; x += 1) {
      const xNormalizado = ((x % total) + total) % total;
      tiles.push({
        z: zoom,
        x: xNormalizado,
        y,
        esquerda: x * TILE_SIZE - bordaEsquerda,
        topo: y * TILE_SIZE - bordaTopo,
      });
    }
  }
  return tiles;
}

export function pontoParaPixelDeTela(
  ponto: Ponto,
  opcoes: { readonly centro: Ponto; readonly zoom: number },
): Pixel {
  const centroPixel = mundoEmPixel(opcoes.centro, opcoes.zoom);
  const pontoPixel = mundoEmPixel(ponto, opcoes.zoom);
  return {
    x: pontoPixel.x - (centroPixel.x - opcoes.largura / 2),
    y: pontoPixel.y - (centroPixel.y - opcoes.altura / 2),
  };
}

export function enquadrarPontos(
  pontos: readonly Ponto[],
  opcoes: {
    readonly largura: number;
    readonly altura: number;
    readonly padding?: number;
    readonly zoomMaximo?: number;
  },
): Ponto & { readonly zoom: number } {
  const { largura, altura } = opcoes;
  const padding = opcoes.padding ?? 48;
  const zoomMaximo = opcoes.zoomMaximo ?? 15;
  if (pontos.length === 0) {
    return { lat: -23.5505, lng: -46.6333, zoom: 12 };
  }
  let latMin = Infinity;
  let latMax = -Infinity;
  let lngMin = Infinity;
  let lngMax = -Infinity;
  for (const ponto of pontos) {
    latMin = Math.min(latMin, ponto.lat);
    latMax = Math.max(latMax, ponto.lat);
    lngMin = Math.min(lngMin, ponto.lng);
    lngMax = Math.max(lngMax, ponto.lng);
  }
  const cantoMin = mundoEmPixel({ lat: latMax, lng: lngMin }, 0);
  const cantoMax = mundoEmPixel({ lat: latMin, lng: lngMax }, 0);
  const dx = Math.max(cantoMax.x - cantoMin.x, 1e-6);
  const dy = Math.max(cantoMax.y - cantoMin.y, 1e-6);
  const disponivelLargura = Math.max(largura - padding * 2, TILE_SIZE / 4);
  const disponivelAltura = Math.max(altura - padding * 2, TILE_SIZE / 4);
  const zoom = Math.min(
    zoomMaximo,
    Math.floor(
      Math.log2(Math.min(disponivelLargura / dx, disponivelAltura / dy)),
    ),
  );
  return {
    lat: (latMin + latMax) / 2,
    lng: (lngMin + lngMax) / 2,
    zoom: Math.max(0, zoom),
  };
}
