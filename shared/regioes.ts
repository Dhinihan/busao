import { CORES_POR_LETREIRO } from "./cores.ts";
import { prefixoLetreiro } from "./gtfs.ts";

export type Regiao = {
  readonly nome: string;
  readonly cor: string;
};

// A SPTrans divide a cidade em áreas operacionais identificadas pelo
// primeiro dígito do letreiro (área de origem da linha); nas noturnas o
// dígito vem logo após o "N". As cores seguem a paleta oficial por lote;
// o Centro é região neutra e não recebe cor.
const AREAS: Readonly<Record<number, Regiao>> = {
  1: { nome: "Noroeste", cor: "#7cb342" },
  2: { nome: "Norte", cor: "#1e3a8a" },
  3: { nome: "Nordeste", cor: "#fdd835" },
  4: { nome: "Leste", cor: "#c62828" },
  5: { nome: "Sudeste", cor: "#2e7d32" },
  6: { nome: "Sul", cor: "#0277bd" },
  7: { nome: "Sudoeste", cor: "#8b2635" },
  8: { nome: "Oeste", cor: "#ef6c00" },
  9: { nome: "Central", cor: "#9aa0a6" },
};

export function regiaoDoLetreiro(letreiro: string): Regiao | null {
  const digito = letreiro.charAt(0) === "N" ? letreiro.charAt(1) : letreiro.charAt(0);
  const area = Number.parseInt(digito, 10);
  return AREAS[area] ?? null;
}

// A cor oficial vem do GTFS publicado pela SPTrans (routes.txt) — a mesma
// fonte que mapas como o Google consomem. A paleta por área operacional fica
// como fallback para linhas fora do feed.
export function corDoLetreiro(letreiro: string): string | null {
  const oficial = CORES_POR_LETREIRO[prefixoLetreiro(letreiro)];
  if (oficial !== undefined) return oficial;
  return regiaoDoLetreiro(letreiro)?.cor ?? null;
}
