export type EntradaCache<T> = {
  readonly dados: T;
  readonly expiraEm: number;
};

export type ArmazenamentoCache<T> = {
  readonly ler: (chave: number) => Promise<EntradaCache<T> | null>;
  readonly gravar: (chave: number, entrada: EntradaCache<T>) => Promise<void>;
};

const TTL_PADRAO_MS = 7_000;
const DEDUPE_PADRAO_MS = 10_000;
const MAX_ENTRADAS_PADRAO = 512;

export function criarCachePosicoes<T>(opcoes: {
  readonly buscar: (chave: number) => Promise<T>;
  readonly agora?: () => number;
  readonly ttlMs?: number;
  // Prazo em que chamadas simultâneas deduplicam para a mesma promise em
  // voo. Fetch upstream preso (sem resposta) não pode deduplicar para
  // sempre — expirado o prazo, a chamada seguinte abre busca nova. Sem
  // timers: usa só o relógio injetado.
  readonly prazoDedupeMs?: number;
  // Teto de entradas em memória: rotas rastreadas e cps reais cabem com
  // folga; acima disso evict FIFO (as entradas também expiram por TTL).
  readonly maxEntradas?: number;
  readonly aoRegistrar?: (chave: number, resultado: "hit" | "miss") => void;
  readonly armazenamento?: ArmazenamentoCache<T>;
}): {
  readonly obter: (chave: number) => Promise<T>;
  readonly tamanho: () => number;
} {
  const agora = opcoes.agora ?? Date.now;
  const ttlMs = opcoes.ttlMs ?? TTL_PADRAO_MS;
  const prazoDedupeMs = opcoes.prazoDedupeMs ?? DEDUPE_PADRAO_MS;
  const maxEntradas = opcoes.maxEntradas ?? MAX_ENTRADAS_PADRAO;
  const armazenamento = opcoes.armazenamento;
  const entradasMemoria = new Map<number, EntradaCache<T>>();
  const emVoo = new Map<number, { readonly busca: Promise<T>; readonly iniciadoEm: number }>();

  function removerExpiradasMemoria(): void {
    const instante = agora();
    for (const [chave, entrada] of entradasMemoria) {
      if (entrada.expiraEm <= instante) entradasMemoria.delete(chave);
    }
  }

  function guardar(chave: number, dados: T): void {
    removerExpiradasMemoria();
    entradasMemoria.set(chave, {
      dados,
      expiraEm: agora() + ttlMs,
    });
    // Evict FIFO limitado ao excedente (o runtime da capsule barra loops
    // `while` no código de servidor — docs/lakebed.md).
    const excedente = entradasMemoria.size - maxEntradas;
    for (let i = 0; i < excedente; i += 1) {
      const maisAntiga = entradasMemoria.keys().next().value;
      if (maisAntiga === undefined) break;
      entradasMemoria.delete(maisAntiga);
    }
  }

  function registrar(chave: number, resultado: "hit" | "miss"): void {
    opcoes.aoRegistrar?.(chave, resultado);
  }

  // Posse da busca: só a geração vigente pode escrever no cache e limpar a
  // entrada em voo. Uma busca antiga que resolve tarde (fetch preso que
  // volta depois de outra busca assumir) tem o resultado descartado.
  const geracoes = new Map<number, number>();

  function iniciarBusca(
    chave: number,
    executar: (vigente: () => boolean) => Promise<T>,
  ): Promise<T> {
    const minha = (geracoes.get(chave) ?? 0) + 1;
    geracoes.set(chave, minha);
    const vigente = (): boolean => geracoes.get(chave) === minha;
    const busca = executar(vigente);
    const limpar = (): void => {
      const atual = emVoo.get(chave);
      if (atual !== undefined && atual.busca === busca) emVoo.delete(chave);
    };
    busca.then(
      (dados) => {
        if (vigente()) guardar(chave, dados);
        limpar();
      },
      limpar,
    );
    emVoo.set(chave, { busca, iniciadoEm: agora() });
    return busca;
  }

  function obterDeMemoria(chave: number): Promise<T> {
    const fresca = entradasMemoria.get(chave);
    if (fresca !== undefined && fresca.expiraEm > agora()) {
      registrar(chave, "hit");
      return Promise.resolve(fresca.dados);
    }
    registrar(chave, "miss");
    return iniciarBusca(chave, () => opcoes.buscar(chave));
  }

  function obterDeArmazenamento(chave: number): Promise<T> {
    return iniciarBusca(chave, async (vigente) => {
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
      if (vigente()) {
        await armazenamentoDefinido.gravar(chave, {
          dados,
          expiraEm: agora() + ttlMs,
        });
      }
      return dados;
    });
  }

  return {
    obter(chave: number): Promise<T> {
      const andamento = emVoo.get(chave);
      if (andamento !== undefined) {
        if (agora() - andamento.iniciadoEm <= prazoDedupeMs) {
          registrar(chave, "hit");
          return andamento.busca;
        }
        // Fetch upstream preso: não deduplica para sempre — a chamada
        // seguinte abre busca nova e substitui a entrada em voo.
        emVoo.delete(chave);
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
