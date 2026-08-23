import type { PosicoesDaLinha } from "../shared/tipos.ts";

type Entrada = {
  readonly dados: PosicoesDaLinha;
  readonly expiraEm: number;
};

const TTL_PADRAO_MS = 7_000;

export function criarCachePosicoes(opcoes: {
  readonly buscar: (linhaId: number) => Promise<PosicoesDaLinha>;
  readonly agora?: () => number;
  readonly ttlMs?: number;
  readonly aoRegistrar?: (linhaId: number, resultado: "hit" | "miss") => void;
}): {
  readonly obter: (linhaId: number) => Promise<PosicoesDaLinha>;
  readonly tamanho: () => number;
} {
  const agora = opcoes.agora ?? Date.now;
  const ttlMs = opcoes.ttlMs ?? TTL_PADRAO_MS;
  const entradas = new Map<number, Entrada>();
  const emVoo = new Map<number, Promise<PosicoesDaLinha>>();

  function removerExpiradas(): void {
    const instante = agora();
    for (const [linhaId, entrada] of entradas) {
      if (entrada.expiraEm <= instante) entradas.delete(linhaId);
    }
  }

  return {
    obter(linhaId: number): Promise<PosicoesDaLinha> {
      const fresca = entradas.get(linhaId);
      if (fresca !== undefined && fresca.expiraEm > agora()) {
        opcoes.aoRegistrar?.(linhaId, "hit");
        return Promise.resolve(fresca.dados);
      }

      const andamento = emVoo.get(linhaId);
      if (andamento !== undefined) {
        opcoes.aoRegistrar?.(linhaId, "hit");
        return andamento;
      }

      opcoes.aoRegistrar?.(linhaId, "miss");
      const busca = opcoes
        .buscar(linhaId)
        .then((dados) => {
          removerExpiradas();
          entradas.set(linhaId, { dados, expiraEm: agora() + ttlMs });
          return dados;
        })
        .finally(() => {
          emVoo.delete(linhaId);
        });
      emVoo.set(linhaId, busca);
      return busca;
    },

    tamanho(): number {
      removerExpiradas();
      return entradas.size;
    },
  };
}
