import { useEffect, useState } from "preact/hooks";
import { decodificarParadasGzip } from "../shared/paradas";
import type { Parada } from "../shared/paradas";
import { ASSET_PARADAS_GZIP } from "./paradas-dados.ts";

// Asset gerado offline (gtfs/pipeline.ts → client/paradas-dados.ts), embutido
// no bundle comprimido: zero request para trazer os pontos ao cliente. A
// descompressão (~22 mil paradas) roda uma vez, quando o mapa cruza o limiar
// de zoom pela primeira vez.
let decodificadas: Promise<readonly Parada[]> | null = null;

function carregar(): Promise<readonly Parada[]> {
  if (decodificadas !== null) return decodificadas;
  decodificadas = decodificarParadasGzip(ASSET_PARADAS_GZIP).then((paradas) => {
    if (paradas === null) throw new Error("asset de paradas inválido");
    return paradas;
  });
  return decodificadas;
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
    let cancelado = false;
    carregar()
      .then((paradas) => {
        if (!cancelado) setEstado({ paradas, erro: null });
      })
      .catch(() => {
        if (!cancelado) {
          setEstado({
            paradas: null,
            erro: "pontos de ônibus indisponíveis agora",
          });
        }
      });
    return () => {
      cancelado = true;
    };
  }, [quer, estado.paradas]);
  return estado;
}
