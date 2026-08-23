import { useCallback, useEffect, useState } from "preact/hooks";
import { api, ErroApi } from "./api";
import { ehLinha } from "../shared/parsers.ts";
import type { Linha, PosicoesDaLinha } from "../shared/tipos.ts";

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

export function usePosicoes(idLinha: number | null): EstadoPosicoes {
  const [estado, setEstado] = useState<EstadoPosicoes>(ESTADO_INICIAL);

  useEffect(() => {
    setEstado(ESTADO_INICIAL);
    if (idLinha === null) return;

    let cancelado = false;
    let emVoo = false;
    let timer: number | undefined;
    let controle: AbortController | null = null;

    const consultar = async (): Promise<void> => {
      if (emVoo) return;
      emVoo = true;
      controle = new AbortController();
      const tempoEsgotado = window.setTimeout(() => controle?.abort(), TIMEOUT_MS);
      try {
        const dados = await api.posicoes(idLinha, { sinal: controle.signal });
        if (!cancelado) {
          setEstado({ dados, erro: null, atualizadoEm: new Date() });
        }
      } catch (erro) {
        if (!cancelado) {
          const mensagem =
            erro instanceof ErroApi
              ? erro.message
              : "não foi possível atualizar as posições";
          setEstado((atual) => ({ ...atual, erro: mensagem }));
        }
      } finally {
        window.clearTimeout(tempoEsgotado);
        emVoo = false;
        if (!cancelado && !document.hidden) {
          timer = window.setTimeout(() => void consultar(), INTERVALO_MS);
        }
      }
    };

    const aoMudarVisibilidade = (): void => {
      window.clearTimeout(timer);
      if (!document.hidden) void consultar();
    };

    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    void consultar();

    return () => {
      cancelado = true;
      window.clearTimeout(timer);
      controle?.abort();
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [idLinha]);

  return estado;
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
