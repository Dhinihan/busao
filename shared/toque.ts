import type { Pixel } from "./tile-math";

export type Toque = Pixel & { readonly t: number };

const TOQUE_MAX_MS = 300;
const TOQUE_MAX_MOVIMENTO_PX = 10;
const DUPLO_MAX_INTERVALO_MS = 350;
const DUPLO_MAX_DISTANCIA_PX = 30;

function distancia(a: Pixel, b: Pixel): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Um toque é um dedo que desce e sobe rápido, sem arrastar.
export function ehToque(pressionou: Toque, soltou: Toque): boolean {
  return (
    soltou.t - pressionou.t <= TOQUE_MAX_MS &&
    distancia(pressionou, soltou) <= TOQUE_MAX_MOVIMENTO_PX
  );
}

// Dois toques seguidos, perto no tempo e no espaço.
export function ehDuploToque(anterior: Toque | null, atual: Toque): boolean {
  return (
    anterior !== null &&
    atual.t - anterior.t <= DUPLO_MAX_INTERVALO_MS &&
    distancia(anterior, atual) <= DUPLO_MAX_DISTANCIA_PX
  );
}
