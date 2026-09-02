// Asset estático de pontos de ônibus (gerado por gtfs/pipeline.ts a partir
// do stops.txt do GTFS). Codificação enxuta para caber no limite de 1 MB do
// artifact: paradas ordenadas por (lat,lng), coordenadas como deltas base36
// e letreiros como índices no dicionário. Sem I/O — o pipeline codifica, o
// cliente decodifica.

export type Parada = {
  readonly lat: number;
  readonly lng: number;
  readonly letreiros: readonly string[];
  readonly cp: number | null;
};

export type AssetParadas = {
  readonly feed_em: string;
  readonly letreiros: readonly string[];
  readonly y: readonly string[];
  readonly x: readonly string[];
  readonly l: readonly string[];
  readonly c?: readonly number[];
};

const BASE = 36;

function paraBase36(valor: number): string {
  const negativo = valor < 0;
  let resto = Math.abs(valor);
  let texto = "";
  do {
    texto = "0123456789abcdefghijklmnopqrstuvwxyz"[resto % BASE] + texto;
    resto = Math.floor(resto / BASE);
  } while (resto > 0);
  return (negativo ? "-" : "") + texto;
}

export type ParadaBruta = {
  readonly lat: number;
  readonly lng: number;
  readonly letreiros: readonly string[];
  readonly cp?: number | null;
};

export function codificarParadas(
  feedEm: string,
  paradas: readonly ParadaBruta[],
): AssetParadas {
  const ordenadas = [...paradas].sort(
    (a, b) => a.lat - b.lat || a.lng - b.lng,
  );
  const dicionario = [
    ...new Set(ordenadas.flatMap((p) => p.letreiros)),
  ].sort((a, b) => a.localeCompare(b));
  const indice = new Map(dicionario.map((l, i) => [l, i]));

  const y: string[] = [];
  const x: string[] = [];
  const l: string[] = [];
  const c: number[] = [];
  let temCp = false;
  let yAnterior = 0;
  let xAnterior = 0;
  for (const parada of ordenadas) {
    const lat = Math.round(parada.lat * 1e5);
    const lng = Math.round(parada.lng * 1e5);
    y.push(paraBase36(lat - yAnterior));
    x.push(paraBase36(lng - xAnterior));
    yAnterior = lat;
    xAnterior = lng;
    l.push(
      parada.letreiros
        .map((letreiro) => indice.get(letreiro) ?? -1)
        .filter((i) => i >= 0)
        .sort((a, b) => a - b)
        .map(paraBase36)
        .join(","),
    );
    const cp = parada.cp === undefined || parada.cp === null ? 0 : parada.cp;
    if (cp !== 0) temCp = true;
    c.push(cp);
  }
  return {
    feed_em: feedEm,
    letreiros: dicionario,
    y,
    x,
    l,
    ...(temCp ? { c } : {}),
  };
}

function textoBase36(valor: unknown): number | null {
  if (typeof valor !== "string" || !/^-?[0-9a-z]+$/.test(valor)) return null;
  const numero = parseInt(valor, BASE);
  return Number.isFinite(numero) ? numero : null;
}

export function decodificarParadas(bruto: unknown): readonly Parada[] | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  if (!("letreiros" in bruto) || !Array.isArray(bruto.letreiros)) return null;
  const dicionario = bruto.letreiros;
  if (!dicionario.every((l) => typeof l === "string")) return null;
  if (!("y" in bruto) || !Array.isArray(bruto.y)) return null;
  if (!("x" in bruto) || !Array.isArray(bruto.x)) return null;
  if (!("l" in bruto) || !Array.isArray(bruto.l)) return null;
  const { y, x, l } = bruto;
  const total = y.length;
  if (total === 0 || x.length !== total || l.length !== total) return null;
  const cps = "c" in bruto && Array.isArray(bruto.c) ? bruto.c : null;
  if (cps !== null && cps.length !== total) return null;

  const paradas: Parada[] = [];
  let lat = 0;
  let lng = 0;
  for (let i = 0; i < total; i += 1) {
    const dy = textoBase36(y[i]);
    const dx = textoBase36(x[i]);
    const lista = l[i];
    if (dy === null || dx === null || typeof lista !== "string") return null;
    lat += dy;
    lng += dx;
    if (Math.abs(lat) > 9000000 || Math.abs(lng) > 18000000) return null;
    const letreiros: string[] = [];
    if (lista !== "") {
      for (const brutoIndice of lista.split(",")) {
        const indice = textoBase36(brutoIndice);
        const letreiro = indice === null ? undefined : dicionario[indice];
        if (typeof letreiro !== "string") return null;
        letreiros.push(letreiro);
      }
    }
    const cpBruto = cps === null ? 0 : cps[i];
    const cp = typeof cpBruto === "number" && cpBruto > 0 ? cpBruto : null;
    paradas.push({ lat: lat / 1e5, lng: lng / 1e5, letreiros, cp });
  }
  return paradas;
}

// Paradas dentro do quadro visível (com folga), para render por frame.
export function paradasNoQuadro(
  paradas: readonly Parada[],
  limites: {
    readonly latMin: number;
    readonly latMax: number;
    readonly lngMin: number;
    readonly lngMax: number;
  },
): readonly Parada[] {
  const noQuadro: Parada[] = [];
  for (const parada of paradas) {
    if (
      parada.lat >= limites.latMin &&
      parada.lat <= limites.latMax &&
      parada.lng >= limites.lngMin &&
      parada.lng <= limites.lngMax
    ) {
      noQuadro.push(parada);
    }
  }
  return noQuadro;
}
