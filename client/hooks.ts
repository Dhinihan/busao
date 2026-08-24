import { useCallback, useEffect, useState } from "preact/hooks";
import { api, ErroApi } from "./api";
import { ehLinha } from "../shared/parsers.ts";
import type { Linha, PosicoesDaLinha, RotaDaLinha } from "../shared/tipos.ts";

export function useValorPostergado<T>(valor: T, atrasoMs: number): T {
  const [postergado, setPostergado] = useState(valor);
  useEffect(() => {
    const timer = window.setTimeout(() => setPostergado(valor), atrasoMs);
    return () => window.clearTimeout(timer);
  }, [valor, atrasoMs]);
  return postergado;
}

const CHAVE_FAVORITAS = "busao:favoritas";

function lerFavoritas(): Linha[] {
  try {
    const cru = localStorage.getItem(CHAVE_FAVORITAS);
    if (cru === null) return [];
    const bruto: unknown = JSON.parse(cru);
    if (!Array.isArray(bruto)) return [];
    return bruto.filter(ehLinha);
  } catch {
    return [];
  }
}

export function useFavoritas(): {
  readonly favoritas: readonly Linha[];
  readonly alternar: (linha: Linha) => void;
  readonly tem: (id: number) => boolean;
} {
  const [favoritas, setFavoritas] = useState<readonly Linha[]>(lerFavoritas);

  useEffect(() => {
    localStorage.setItem(CHAVE_FAVORITAS, JSON.stringify(favoritas));
  }, [favoritas]);

  useEffect(() => {
    function aoMudarEmOutraAba(evento: StorageEvent): void {
      if (evento.key === CHAVE_FAVORITAS) setFavoritas(lerFavoritas());
    }
    window.addEventListener("storage", aoMudarEmOutraAba);
    return () => window.removeEventListener("storage", aoMudarEmOutraAba);
  }, []);

  const alternar = useCallback((linha: Linha): void => {
    setFavoritas((atuais) =>
      atuais.some((l) => l.id === linha.id)
        ? atuais.filter((l) => l.id !== linha.id)
        : [...atuais, linha],
    );
  }, []);

  const tem = useCallback(
    (id: number) => favoritas.some((l) => l.id === id),
    [favoritas],
  );

  return { favoritas, alternar, tem };
}

const INTERVALO_MS = 10_000;
const TIMEOUT_MS = 8_000;

export type EstadoPosicoes = {
  readonly dados: PosicoesDaLinha | null;
  readonly erro: string | null;
  readonly atualizadoEm: Date | null;
};

const ESTADO_INICIAL: EstadoPosicoes = {
  dados: null,
  erro: null,
  atualizadoEm: null,
};

export function usePosicoesVarias(
  ids: readonly number[],
): Readonly<Record<number, EstadoPosicoes>> {
  const [porId, setPorId] = useState<
    Readonly<Record<number, EstadoPosicoes>>
  >({});
  const chave = [...ids].sort((a, b) => a - b).join(",");

  useEffect(() => {
    const alvos = chave === "" ? [] : chave.split(",").map(Number);
    if (alvos.length === 0) return;

    let cancelado = false;
    const emVoo = new Set<number>();
    const controles = new Map<number, AbortController>();
    const timers = new Map<number, number>();

    const consultar = async (id: number): Promise<void> => {
      if (emVoo.has(id)) return;
      emVoo.add(id);
      const controle = new AbortController();
      controles.set(id, controle);
      const tempoEsgotado = window.setTimeout(
        () => controle.abort(),
        TIMEOUT_MS,
      );
      try {
        const dados = await api.posicoes(id, { sinal: controle.signal });
        if (!cancelado) {
          setPorId((atual) => ({
            ...atual,
            [id]: { dados, erro: null, atualizadoEm: new Date() },
          }));
        }
      } catch (erro) {
        if (!cancelado) {
          const mensagem =
            erro instanceof ErroApi
              ? erro.message
              : "não foi possível atualizar as posições";
          setPorId((atual) => ({
            ...atual,
            [id]: {
              ...(atual[id] ?? ESTADO_INICIAL),
              erro: mensagem,
            },
          }));
        }
      } finally {
        window.clearTimeout(tempoEsgotado);
        emVoo.delete(id);
        if (!cancelado && !document.hidden) {
          timers.set(
            id,
            window.setTimeout(() => void consultar(id), INTERVALO_MS),
          );
        }
      }
    };

    const aoMudarVisibilidade = (): void => {
      for (const timer of timers.values()) window.clearTimeout(timer);
      timers.clear();
      if (!document.hidden) for (const id of alvos) void consultar(id);
    };

    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    for (const id of alvos) void consultar(id);

    return () => {
      cancelado = true;
      for (const timer of timers.values()) window.clearTimeout(timer);
      for (const controle of controles.values()) controle.abort();
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [chave]);

  // Entradas de linhas que saíram do mapa não vazam para a renderização.
  const vivas: Record<number, EstadoPosicoes> = {};
  for (const id of ids) {
    const estado = porId[id];
    if (estado !== undefined) vivas[id] = estado;
  }
  return vivas;
}

export type EstadoRota = {
  readonly dados: RotaDaLinha | null;
  readonly erro: string | null;
};

const TIMEOUT_ROTA_MS = 8_000;

export function useRotasVarias(
  linhas: readonly Linha[],
): Readonly<Record<number, EstadoRota>> {
  const [porId, setPorId] = useState<
    Readonly<Record<number, EstadoRota>>
  >({});
  const chave = [...linhas]
    .sort((a, b) => a.id - b.id)
    .map((linha) => `${linha.id}:${linha.letreiro}`)
    .join(",");

  useEffect(() => {
    const alvos = [...linhas].sort((a, b) => a.id - b.id);
    if (alvos.length === 0) return;

    let cancelado = false;
    const controles = new Map<number, AbortController>();

    const consultar = async (linha: Linha): Promise<void> => {
      const controle = new AbortController();
      controles.set(linha.id, controle);
      const tempoEsgotado = window.setTimeout(
        () => controle.abort(),
        TIMEOUT_ROTA_MS,
      );
      try {
        const dados = await api.rota(linha.id, linha.letreiro, {
          sinal: controle.signal,
        });
        if (!cancelado) {
          setPorId((atual) => ({
            ...atual,
            [linha.id]: { dados, erro: null },
          }));
        }
      } catch (erro) {
        if (!cancelado) {
          const mensagem =
            erro instanceof ErroApi
              ? erro.message
              : "não foi possível carregar o trajeto";
          setPorId((atual) => ({
            ...atual,
            [linha.id]: { dados: null, erro: mensagem },
          }));
        }
      } finally {
        window.clearTimeout(tempoEsgotado);
      }
    };

    // Uma linha já resolvida não deve ser buscada de novo só porque outra foi adicionada.
    for (const linha of alvos) {
      if (porId[linha.id] !== undefined) continue;
      void consultar(linha);
    }

    return () => {
      cancelado = true;
      for (const controle of controles.values()) controle.abort();
    };
  }, [chave]);

  const vivas: Record<number, EstadoRota> = {};
  for (const linha of linhas) {
    const estado = porId[linha.id];
    if (estado !== undefined) vivas[linha.id] = estado;
  }
  return vivas;
}

export type EstadoLocalizacao = {
  readonly ponto: readonly [number, number] | null;
  readonly erro: string | null;
};

const SEM_LOCALIZACAO: EstadoLocalizacao = { ponto: null, erro: null };

function mensagemDeGeolocalizacao(erro: GeolocationPositionError): string {
  if (erro.code === erro.PERMISSION_DENIED)
    return "permissão de localização negada";
  if (erro.code === erro.POSITION_UNAVAILABLE)
    return "localização indisponível agora";
  return "não foi possível obter sua localização";
}

const CHAVE_RASTREAMENTO = "busao:rastreamento";

function lerRastreamentoInicial(): boolean {
  try {
    return localStorage.getItem(CHAVE_RASTREAMENTO) !== "off";
  } catch {
    return true;
  }
}

export function useLocalizacao(): {
  readonly estado: EstadoLocalizacao;
  readonly ativa: boolean;
  readonly alternar: () => void;
} {
  const [estado, setEstado] = useState<EstadoLocalizacao>(SEM_LOCALIZACAO);
  const [ativa, setAtiva] = useState(lerRastreamentoInicial);

  useEffect(() => {
    if (!ativa) return;
    if (!("geolocation" in navigator)) {
      setEstado({ ponto: null, erro: "seu navegador não tem localização" });
      setAtiva(false);
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (posicao) =>
        setEstado({
          ponto: [posicao.coords.latitude, posicao.coords.longitude],
          erro: null,
        }),
      (erro) => setEstado({ ponto: null, erro: mensagemDeGeolocalizacao(erro) }),
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 15_000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [ativa]);

  const alternar = useCallback(() => {
    setEstado(SEM_LOCALIZACAO);
    setAtiva((v) => {
      const proximo = !v;
      try {
        localStorage.setItem(CHAVE_RASTREAMENTO, proximo ? "on" : "off");
      } catch {
        /* preferência é opcional */
      }
      return proximo;
    });
  }, []);

  return { estado, ativa, alternar };
}
