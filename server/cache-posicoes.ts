export type EntradaCache<T> = {
  readonly dados: T;
  readonly expiraEm: number;
};

export type ArmazenamentoCache<T> = {
  readonly ler: (chave: number) => Promise<EntradaCache<T> | null>;
  readonly gravar: (chave: number, entrada: EntradaCache<T>) => Promise<void>;
};

const TTL_PADRAO_MS = 7_000;

export function criarCachePosicoes<T>(opcoes: {
  readonly buscar: (chave: number) => Promise<T>;
  readonly agora?: () => number;
  readonly ttlMs?: number;
  readonly aoRegistrar?: (chave: number, resultado: "hit" | "miss") => void;
  readonly armazenamento?: ArmazenamentoCache<T>;
}): {
  readonly obter: (chave: number) => Promise<T>;
  readonly tamanho: () => number;
} {
  const agora = opcoes.agora ?? Date.now;
  const ttlMs = opcoes.ttlMs ?? TTL_PADRAO_MS;
  const armazenamento = opcoes.armazenamento;
  const entradasMemoria = new Map<number, EntradaCache<T>>();
  const emVoo = new Map<number, Promise<T>>();

  function removerExpiradasMemoria(): void {
    const instante = agora();
    for (const [chave, entrada] of entradasMemoria) {
      if (entrada.expiraEm <= instante) entradasMemoria.delete(chave);
    }
  }

  function registrar(chave: number, resultado: "hit" | "miss"): void {
    opcoes.aoRegistrar?.(chave, resultado);
  }

  function iniciarBusca(
    chave: number,
    executar: () => Promise<T>,
  ): Promise<T> {
    const busca = executar();
    const limpar = (): void => {
      emVoo.delete(chave);
    };
    busca.then(limpar, limpar);
    emVoo.set(chave, busca);
    return busca;
  }

  function obterDeMemoria(chave: number): Promise<T> {
    const fresca = entradasMemoria.get(chave);
    if (fresca !== undefined && fresca.expiraEm > agora()) {
      registrar(chave, "hit");
      return Promise.resolve(fresca.dados);
    }
    registrar(chave, "miss");
    return iniciarBusca(
      chave,
      () =>
        opcoes
          .buscar(chave)
          .then((dados) => {
            removerExpiradasMemoria();
            entradasMemoria.set(chave, {
              dados,
              expiraEm: agora() + ttlMs,
            });
            return dados;
          })
          .finally(() => {
            emVoo.delete(chave);
          }),
    );
  }

  function obterDeArmazenamento(chave: number): Promise<T> {
    return iniciarBusca(chave, async () => {
      const armazenamentoDefinido = armazenamento;
      if (armazenamentoDefinido === undefined) {
        throw new Error("inacessível");
      }
      const fresca = await armazenamentoDefinido.ler(chave);
      if (fresca !== null && fresca.expiraEm > agora()) {
        registrar(chave, "hit");
        return fresca.dados;
      }
      registrar(chave, "miss");
      const dados = await opcoes.buscar(chave);
      await armazenamentoDefinido.gravar(chave, {
        dados,
        expiraEm: agora() + ttlMs,
      });
      return dados;
    });
  }

  return {
    obter(chave: number): Promise<T> {
      const andamento = emVoo.get(chave);
      if (andamento !== undefined) {
        registrar(chave, "hit");
        return andamento;
      }
      return armazenamento === undefined
        ? obterDeMemoria(chave)
        : obterDeArmazenamento(chave);
    },

    tamanho(): number {
      removerExpiradasMemoria();
      return entradasMemoria.size;
    },
  };
}
