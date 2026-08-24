import { paraRotaGeoSampa } from "../shared/parsers.ts";
import type { RotaDaLinha } from "../shared/tipos.ts";

const WFS_URL =
  "https://wfs.geosampa.prefeitura.sp.gov.br/geoserver/geoportal/ows";
const TEMPO_LIMITE_PADRAO_MS = 5_000;
const TTL_CACHE_PADRAO_MS = 5 * 60_000;
const LIMITE_CACHE = 64;

export class ErroGeoSampa extends Error {}

export type ClienteGeoSampa = {
  readonly rotaDaLinha: (letreiro: string) => Promise<RotaDaLinha>;
};

type OpcoesClienteGeoSampa = {
  readonly buscar?: typeof fetch;
  readonly tempoLimiteMs?: number;
  readonly ttlCacheMs?: number;
  readonly agora?: () => number;
};

type EntradaCache = {
  readonly rota: RotaDaLinha;
  readonly expiraEm: number;
};

type ResultadoGeoSampa = {
  readonly resposta: Response;
  readonly corpo: unknown | null;
};

function urlDaLinha(letreiro: string): string {
  const filtro = `cd_linha_geometria='${letreiro
    .trim()
    .replaceAll("'", "''")}'`;
  return (
    `${WFS_URL}?service=WFS&version=1.0.0&request=GetFeature` +
    `&typeName=geoportal%3Alinha_onibus&outputFormat=application%2Fjson` +
    `&srsName=EPSG%3A4326&CQL_FILTER=${encodeURIComponent(filtro)}`
  );
}

export function criarClienteGeoSampa(
  opcoes: OpcoesClienteGeoSampa = {},
): ClienteGeoSampa {
  const buscar = opcoes.buscar ?? fetch;
  const tempoLimiteMs = opcoes.tempoLimiteMs ?? TEMPO_LIMITE_PADRAO_MS;
  const ttlCacheMs = opcoes.ttlCacheMs ?? TTL_CACHE_PADRAO_MS;
  const agora = opcoes.agora ?? Date.now;
  const cache = new Map<string, EntradaCache>();
  const chamadasEmVoo = new Map<string, Promise<RotaDaLinha>>();

  async function buscarGeoJson(url: string): Promise<ResultadoGeoSampa> {
    const controle = new AbortController();
    const timer = setTimeout(() => controle.abort(), tempoLimiteMs);
    try {
      let resposta: Response;
      try {
        resposta = await buscar(url, { signal: controle.signal });
      } catch (causa) {
        if (controle.signal.aborted) {
          throw new ErroGeoSampa(
            "tempo limite ao consultar o mapa do GeoSampa",
            { cause: causa },
          );
        }
        throw new ErroGeoSampa("sem contato com o mapa do GeoSampa", {
          cause: causa,
        });
      }

      if (!resposta.ok) return { resposta, corpo: null };

      try {
        return { resposta, corpo: await resposta.json() };
      } catch (causa) {
        if (controle.signal.aborted) {
          throw new ErroGeoSampa(
            "tempo limite ao consultar o mapa do GeoSampa",
            { cause: causa },
          );
        }
        throw new ErroGeoSampa("resposta inválida do mapa do GeoSampa", {
          cause: causa,
        });
      }
    } finally {
      clearTimeout(timer);
    }
  }

  function obterCache(chave: string): RotaDaLinha | null {
    const entrada = cache.get(chave);
    if (entrada === undefined) return null;
    if (entrada.expiraEm <= agora()) {
      cache.delete(chave);
      return null;
    }
    return entrada.rota;
  }

  function guardarCache(chave: string, rota: RotaDaLinha): void {
    if (cache.size >= LIMITE_CACHE && !cache.has(chave)) {
      const primeiraChave = cache.keys().next().value;
      if (typeof primeiraChave === "string") cache.delete(primeiraChave);
    }
    cache.set(chave, { rota, expiraEm: agora() + ttlCacheMs });
  }

  async function buscarRota(chave: string): Promise<RotaDaLinha> {
    const { resposta, corpo } = await buscarGeoJson(urlDaLinha(chave));
    if (!resposta.ok) {
      throw new ErroGeoSampa(
        `o mapa do GeoSampa respondeu HTTP ${resposta.status}`,
      );
    }
    const rota = paraRotaGeoSampa(corpo);
    if (rota === null) {
      throw new ErroGeoSampa("resposta inesperada de trajeto");
    }
    return rota;
  }

  return {
    async rotaDaLinha(letreiro: string): Promise<RotaDaLinha> {
      const chave = letreiro.trim();
      if (chave === "") {
        throw new ErroGeoSampa("linha sem letreiro");
      }
      const cacheada = obterCache(chave);
      if (cacheada !== null) return cacheada;

      const existente = chamadasEmVoo.get(chave);
      if (existente !== undefined) return existente;

      const chamada = buscarRota(chave);
      chamadasEmVoo.set(chave, chamada);
      try {
        const rota = await chamada;
        guardarCache(chave, rota);
        return rota;
      } finally {
        if (chamadasEmVoo.get(chave) === chamada) chamadasEmVoo.delete(chave);
      }
    },
  };
}
