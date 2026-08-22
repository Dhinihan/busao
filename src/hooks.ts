import { useCallback, useEffect, useState } from "react";
import { api, ErroApi } from "./api";
import type { Linha, PosicoesDaLinha } from "./types";

export function useValorPostergado<T>(valor: T, atrasoMs: number): T {
  const [postergado, setPostergado] = useState(valor);
  useEffect(() => {
    const timer = window.setTimeout(() => setPostergado(valor), atrasoMs);
    return () => window.clearTimeout(timer);
  }, [valor, atrasoMs]);
  return postergado;
}

const CHAVE_FAVORITAS = "busao:favoritas";

function ehLinha(valor: unknown): valor is Linha {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "id" in valor &&
    typeof valor.id === "number" &&
    "letreiro" in valor &&
    typeof valor.letreiro === "string" &&
    "descricao" in valor &&
    typeof valor.descricao === "string"
  );
}

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
    let timer: number | undefined;

    const consultar = async (): Promise<void> => {
      try {
        const dados = await api.posicoes(idLinha);
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
      document.removeEventListener("visibilitychange", aoMudarVisibilidade);
    };
  }, [idLinha]);

  return estado;
}
