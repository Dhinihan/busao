import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { api, ErroApi } from "./api.ts";
import { ehLinha } from "../shared/parsers.ts";
import type { Linha, PosicoesDaLinha, RotaDaLinha, Sentido } from "../shared/tipos.ts";

export function useValorPostergado<T>(valor: T, atrasoMs: number): T {
  const [postergado, setPostergado] = useState(valor);
  useEffect(() => {
    const timer = window.setTimeout(() => setPostergado(valor), atrasoMs);
    return () => window.clearTimeout(timer);
  }, [valor, atrasoMs]);
  return postergado;
}

const SELETOR_FOCavel =
  "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

// Diálogo aria-modal completo: foco entra na abertura, Tab/Shift+Tab
// circulam só pelos controles do diálogo (focus trap) e o foco volta ao
// elemento que abriu o painel. Se mais de um diálogo estiver montado,
// apenas o do topo da pilha reage ao teclado — os de baixo ficam mudos.
const pilhaDialogos: HTMLElement[] = [];

export function useDialogoModal(): {
  readonly secaoRef: (elemento: HTMLElement | null) => void;
} {
  const secaoRef = useRef<HTMLElement | null>(null);
  const focoAnteriorRef = useRef<Element | null>(null);

  useEffect(() => {
    const secao = secaoRef.current;
    if (secao === null) return;
    const dialogo: HTMLElement = secao;
    focoAnteriorRef.current = document.activeElement;
    dialogo.focus();
    pilhaDialogos.push(dialogo);
    const ehTopo = (): boolean =>
      pilhaDialogos[pilhaDialogos.length - 1] === dialogo;

    function aoTeclarTab(evento: KeyboardEvent): void {
      if (evento.key !== "Tab" || !ehTopo()) return;
      const ativo = document.activeElement;
      if (ativo !== null && !dialogo.contains(ativo)) {
        // foco escapou do diálogo: traz de volta
        evento.preventDefault();
        dialogo.focus();
        return;
      }
      const focaveis = [
        ...dialogo.querySelectorAll<HTMLElement>(SELETOR_FOCavel),
      ].filter((el) => !el.hasAttribute("disabled") && el.offsetParent !== null);
      if (focaveis.length === 0) {
        evento.preventDefault();
        dialogo.focus();
        return;
      }
      const primeiro = focaveis[0]!;
      const ultimo = focaveis[focaveis.length - 1]!;
      if (evento.shiftKey && (ativo === primeiro || ativo === dialogo)) {
        evento.preventDefault();
        ultimo.focus();
        return;
      }
      if (!evento.shiftKey && ativo === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    }

    window.addEventListener("keydown", aoTeclarTab, true);
    return () => {
      window.removeEventListener("keydown", aoTeclarTab, true);
      const eraTopo = ehTopo();
      const indice = pilhaDialogos.indexOf(secao);
      if (indice >= 0) pilhaDialogos.splice(indice, 1);
      // só o diálogo do topo devolve o foco — se houver um de baixo, é
      // para ele que o foco deve voltar (o focoAnterior do topo).
      if (eraTopo && focoAnteriorRef.current instanceof HTMLElement) {
        focoAnteriorRef.current.focus();
      }
    };
  }, []);

  return {
    secaoRef: (elemento: HTMLElement | null) => {
      secaoRef.current = elemento;
    },
  };
}

const CHAVE_FAVORITAS = "busao:favoritas";

// Favoritas salvas antes do campo `sentido` existir não codificam direção;
// o `id` (=cl da SPTrans) é único por sentido, então a busca pelo letreiro
// base devolve a mesma linha já com sl — casando por id recuperamos o sentido.
const TEMPO_MIGRACAO_MS = 15_000;

function letreiroBase(letreiro: string): string {
  return letreiro.split("-")[0] ?? letreiro;
}

function ehSentido(valor: unknown): valor is Sentido {
  return valor === "ida" || valor === "volta";
}

function lerFavoritas(): Linha[] {
  try {
    const cru = localStorage.getItem(CHAVE_FAVORITAS);
    if (cru === null) return [];
    const bruto: unknown = JSON.parse(cru);
    if (!Array.isArray(bruto)) return [];
    return bruto.filter(ehLinha).map((linha) =>
      ehSentido(linha.sentido) ? linha : { ...linha, sentido: undefined },
    );
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
    const pendentes = favoritas.filter((l) => l.sentido === undefined);
    if (pendentes.length === 0) return;

    let cancelado = false;
    const controle = new AbortController();
    const tempoEsgotado = window.setTimeout(
      () => controle.abort(),
      TEMPO_MIGRACAO_MS,
    );

    void (async () => {
      const recuperados = new Map<number, Sentido>();
      // Um termo por letreiro base: ida e volta da mesma linha pendem juntos
      // e uma única busca devolve os dois sentidos.
      const termos = new Map<string, number[]>();
      for (const linha of pendentes) {
        const termo = letreiroBase(linha.letreiro);
        if (termo.length < 3) continue;
        const ids = termos.get(termo) ?? [];
        ids.push(linha.id);
        termos.set(termo, ids);
      }

      const aplicar = (): void => {
        if (cancelado || recuperados.size === 0) return;
        setFavoritas((atuais) =>
          atuais.map((a) => {
            const sentido = recuperados.get(a.id);
            return sentido === undefined ? a : { ...a, sentido };
          }),
        );
      };

      for (const [termo, ids] of termos) {
        if (cancelado) return;
        try {
          const encontradas = await api.buscarLinhas(termo, {
            sinal: controle.signal,
          });
          for (const id of ids) {
            const casada = encontradas.find((e) => e.id === id);
            if (casada?.sentido !== undefined) {
              recuperados.set(id, casada.sentido);
            }
          }
        } catch {
          // servidor fora, sem token ou orçamento esgotado: commita o que já
          // resolveu — o restante tenta de novo no próximo boot.
          aplicar();
          return;
        }
      }
      aplicar();
    })();

    return () => {
      cancelado = true;
      window.clearTimeout(tempoEsgotado);
      controle.abort();
    };
    // Uma única tentativa por boot: legadas sem sentido só existem na carga
    // inicial do localStorage; novas favoritas já nascem com `sentido`.
  }, []);

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
  readonly consultando: boolean;
};

const ESTADO_INICIAL: EstadoPosicoes = {
  dados: null,
  erro: null,
  atualizadoEm: null,
  consultando: false,
};

export type FaseCiclo = "com-erro" | "aguardando" | "atualizando" | "ao-vivo";

export function faseDoCiclo(estado: EstadoPosicoes | undefined): FaseCiclo {
  if (estado?.erro !== null && estado?.erro !== undefined) return "com-erro";
  if (estado === undefined || estado.dados === null) return "aguardando";
  return estado.consultando ? "atualizando" : "ao-vivo";
}

function doisDigitos(valor: number): string {
  return String(valor).padStart(2, "0");
}

export function tituloAtualizacao(quando: Date | null): string | null {
  if (quando === null) return null;
  return `atualizado às ${doisDigitos(quando.getHours())}:${doisDigitos(
    quando.getMinutes(),
  )}:${doisDigitos(quando.getSeconds())}`;
}

export type AmostraContagem = {
  readonly id: number;
  readonly letreiro: string;
  readonly total: number | null;
};

export type AvisoRodada = {
  readonly id: number;
  readonly texto: string;
};

// Dif da frota por linha entre ciclos de polling. Evento vale anúncio;
// ciclo rotineiro não. Vibração de ±1 ônibus entre leituras consecutivas
// é ruído conhecido da SPTrans e fica quieto — só cruza zero ou |Δ| ≥ 2.
// O histórico resultante contém apenas o que veio nas amostras: linha que
// saiu do rastreamento esquece a última leitura, e ao voltar anuncia de
// novo como primeira — sem delta contra dado velho de minutos atrás.
export function avisosDeRodada(
  antes: ReadonlyMap<number, number | null>,
  amostras: readonly AmostraContagem[],
): { readonly avisos: readonly AvisoRodada[]; readonly proxima: Map<number, number | null> } {
  const proxima = new Map<number, number | null>();
  const avisos: AvisoRodada[] = [];
  for (const amostra of amostras) {
    const anterior = antes.get(amostra.id);
    proxima.set(amostra.id, amostra.total);
    if (amostra.total === null) continue;
    if (anterior === undefined || anterior === null) {
      avisos.push({
        id: amostra.id,
        texto:
          amostra.total === 0
            ? `${amostra.letreiro} · nenhum ônibus circulando agora`
            : `${amostra.letreiro} · ${amostra.total} ônibus em circulação`,
      });
      continue;
    }
    const diferenca = amostra.total - anterior;
    if (
      diferenca !== 0 &&
      (Math.abs(diferenca) >= 2 || anterior === 0 || amostra.total === 0)
    ) {
      avisos.push({
        id: amostra.id,
        texto:
          amostra.total === 0
            ? `${amostra.letreiro} · nenhum ônibus circulando agora`
            : diferenca > 0
              ? `${amostra.letreiro} · +${diferenca} ônibus`
              : `${amostra.letreiro} · −${-diferenca} ônibus`,
      });
    }
  }
  return { avisos, proxima };
}

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
    let timer: number | undefined;
    let controleAtual: AbortController | null = null;
    let despertar: (() => void) | null = null;
    let interromper: (() => void) | null = null;

    const aguardarVisibilidade = (): Promise<void> =>
      new Promise((resolver) => {
        despertar = () => {
          despertar = null;
          resolver();
        };
      });

    // Espera interrompível: voltar à aba antecipa a próxima rodada em vez
    // de esperar o restante do intervalo.
    const esperar = (ms: number): Promise<void> =>
      new Promise((resolver) => {
        timer = window.setTimeout(resolver, ms);
        interromper = () => {
          window.clearTimeout(timer);
          interromper = null;
          resolver();
        };
      });

    const consultar = async (id: number): Promise<void> => {
      const controle = new AbortController();
      controleAtual = controle;
      const tempoEsgotado = window.setTimeout(
        () => controle.abort(),
        TIMEOUT_MS,
      );
      if (!cancelado) {
        setPorId((atual) => ({
          ...atual,
          [id]: { ...(atual[id] ?? ESTADO_INICIAL), consultando: true },
        }));
      }
      try {
        const dados = await api.posicoes(id, { sinal: controle.signal });
        if (!cancelado) {
          setPorId((atual) => ({
            ...atual,
            [id]: {
              dados,
              erro: null,
              atualizadoEm: new Date(),
              consultando: false,
            },
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
              consultando: false,
            },
          }));
        }
      } finally {
        window.clearTimeout(tempoEsgotado);
      }
    };

    // Poll sequencial (round-robin): no máximo 1 request em voo por
    // dispositivo. Polls paralelos contra um cookie de sessão morto fazem
    // cada request relogar na SPTrans e gravar no DB — a rajada queimou a
    // cota diária de mutations da capsule (ver docs/lakebed.md).
    const laco = async (): Promise<void> => {
      while (!cancelado) {
        if (document.hidden) {
          await aguardarVisibilidade();
          continue;
        }
        const inicioRodada = Date.now();
        for (const id of alvos) {
          if (cancelado || document.hidden) break;
          await consultar(id);
        }
        const resto = INTERVALO_MS - (Date.now() - inicioRodada);
        if (!cancelado && !document.hidden && resto > 0) {
          await esperar(resto);
        }
      }
    };

    const aoMudarVisibilidade = (): void => {
      if (!document.hidden) {
        despertar?.();
        interromper?.();
      }
    };

    document.addEventListener("visibilitychange", aoMudarVisibilidade);
    void laco();

    return () => {
      cancelado = true;
      window.clearTimeout(timer);
      controleAtual?.abort();
      despertar?.();
      interromper?.();
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

export function rotaResolvida(estado: EstadoRota | undefined): boolean {
  return estado !== undefined && estado.dados !== null;
}

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
      if (rotaResolvida(porId[linha.id])) continue;
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
