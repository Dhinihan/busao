import type { PosicoesDaLinha } from "../shared/tipos.ts";

export type EntradaCache = {
  readonly dados: PosicoesDaLinha;
  readonly expiraEm: number;
};

export type ArmazenamentoCache = {
  readonly ler: (linhaId: number) => Promise<EntradaCache | null>;
  readonly gravar: (linhaId: number, entrada: EntradaCache) => Promise<void>;
};

const TTL_PADRAO_MS = 7_000;

export function criarCachePosicoes(opcoes: {
  readonly buscar: (linhaId: number) => Promise<PosicoesDaLinha>;
  readonly agora?: () => number;
  readonly ttlMs?: number;
  readonly aoRegistrar?: (linhaId: number, resultado: "hit" | "miss") => void;
  readonly armazenamento?: ArmazenamentoCache;
}): {
  readonly obter: (linhaId: number) => Promise<PosicoesDaLinha>;
  readonly tamanho: () => number;
} {
  const agora = opcoes.agora ?? Date.now;
  const ttlMs = opcoes.ttlMs ?? TTL_PADRAO_MS;
  const armazenamento = opcoes.armazenamento;
  const entradasMemoria = new Map<number, EntradaCache>();
  const emVoo = new Map<number, Promise<PosicoesDaLinha>>();

  function removerExpiradasMemoria(): void {
    const instante = agora();
    for (const [linhaId, entrada] of entradasMemoria) {
      if (entrada.expiraEm <= instante) entradasMemoria.delete(linhaId);
    }
  }

  function registrar(linhaId: number, resultado: "hit" | "miss"): void {
    opcoes.aoRegistrar?.(linhaId, resultado);
  }

  function iniciarBusca(
    linhaId: number,
    executar: () => Promise<PosicoesDaLinha>,
  ): Promise<PosicoesDaLinha> {
    const busca = executar();
    const limpar = (): void => {
      emVoo.delete(linhaId);
    };
    busca.then(limpar, limpar);
    emVoo.set(linhaId, busca);
    return busca;
  }

  function obterDeMemoria(linhaId: number): Promise<PosicoesDaLinha> {
    const fresca = entradasMemoria.get(linhaId);
    if (fresca !== undefined && fresca.expiraEm > agora()) {
      registrar(linhaId, "hit");
      return Promise.resolve(fresca.dados);
    }
    registrar(linhaId, "miss");
    return iniciarBusca(
      linhaId,
      () =>
        opcoes
          .buscar(linhaId)
          .then((dados) => {
            removerExpiradasMemoria();
            entradasMemoria.set(linhaId, {
              dados,
              expiraEm: agora() + ttlMs,
            });
            return dados;
          })
          .finally(() => {
            emVoo.delete(linhaId);
          }),
    );
  }

  function obterDeArmazenamento(linhaId: number): Promise<PosicoesDaLinha> {
    return iniciarBusca(linhaId, async () => {
      const armazenamentoDefinido = armazenamento;
      if (armazenamentoDefinido === undefined) {
        throw new Error("inacessível");
      }
      const fresca = await armazenamentoDefinido.ler(linhaId);
      if (fresca !== null && fresca.expiraEm > agora()) {
        registrar(linhaId, "hit");
        return fresca.dados;
      }
      registrar(linhaId, "miss");
      const dados = await opcoes.buscar(linhaId);
      await armazenamentoDefinido.gravar(linhaId, {
        dados,
        expiraEm: agora() + ttlMs,
      });
      return dados;
    });
  }

  return {
    obter(linhaId: number): Promise<PosicoesDaLinha> {
      const andamento = emVoo.get(linhaId);
      if (andamento !== undefined) {
        registrar(linhaId, "hit");
        return andamento;
      }
      return armazenamento === undefined
        ? obterDeMemoria(linhaId)
        : obterDeArmazenamento(linhaId);
    },

    tamanho(): number {
      removerExpiradasMemoria();
      return entradasMemoria.size;
    },
  };
}
