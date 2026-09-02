import { useEffect, useState } from "preact/hooks";
import { decodificarParadas } from "../shared/paradas";
import type { Parada } from "../shared/paradas";
import { ASSET_PARADAS } from "./paradas-dados.ts";

// Asset gerado offline (gtfs/pipeline.ts → client/paradas-dados.ts), embutido
// no bundle: zero request para trazer os pontos ao cliente. A decodificação
// (~22 mil paradas) é rápida e acontece só quando o mapa cruza o limiar de
// zoom pela primeira vez.
let decodificadas: readonly Parada[] | null = null;

function carregar(): readonly Parada[] {
  if (decodificadas !== null) return decodificadas;
  const paradas = decodificarParadas(ASSET_PARADAS);
  if (paradas === null) throw new Error("asset de paradas inválido");
  decodificadas = paradas;
  return paradas;
}

export type EstadoParadas = {
  readonly paradas: readonly Parada[] | null;
  readonly erro: string | null;
};

const CARREGANDO: EstadoParadas = { paradas: null, erro: null };

export function useParadas(quer: boolean): EstadoParadas {
  const [estado, setEstado] = useState<EstadoParadas>(CARREGANDO);
  useEffect(() => {
    if (!quer || estado.paradas !== null) return;
    try {
      setEstado({ paradas: carregar(), erro: null });
    } catch {
      setEstado({
        paradas: null,
        erro: "pontos de ônibus indisponíveis agora",
      });
    }
  }, [quer, estado.paradas]);
  return estado;
}
