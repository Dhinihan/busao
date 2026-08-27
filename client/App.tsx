import { Fragment } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { api, ErroApi } from "./api";
import { Estrela } from "./Estrela";
import { Mapa } from "./Mapa";
import { PainelHorarios } from "./PainelHorarios";
import { Casa, Predio } from "./Sentidos";
import {
  avisosDeRodada,
  faseDoCiclo,
  tituloAtualizacao,
  useFavoritas,
  usePosicoesVarias,
  useRotasVarias,
  useValorPostergado,
} from "./hooks";
import type { FaseCiclo } from "./hooks";
import type { Linha, StatusApi } from "../shared/tipos.ts";

const rotulo =
  "mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#66696f]";

function Led(props: { classe?: string; children: preact.ComponentChildren }) {
  return (
    <span
      className={
        "inline-block whitespace-nowrap rounded-lg bg-gradient-to-b from-[#201e19] to-[#131211] px-2.5 py-1.5 font-mono text-[15px] font-black uppercase tracking-[0.08em] text-[#ffb300] " +
        "shadow-[inset_0_0_14px_rgba(255,179,0,0.16),inset_0_0_2px_rgba(255,255,255,0.07)] " +
        (props.classe ?? "")
      }
    >
      {props.children}
    </span>
  );
}

const pontoVivo =
  "h-2 w-2 shrink-0 animate-pulse rounded-full motion-reduce:animate-none";

// Ponto de polling: respira sempre e dispara o blip (anel + decaimento
// âmbar) a cada dado novo — o remount por key reinicia a animação
// sincronizado com a resposta da SPTrans, sem relógio em JS.
function PontoCiclo(props: {
  readonly fase: FaseCiclo;
  readonly momento: Date | null;
}) {
  return (
    <span
      key={props.momento?.getTime() ?? 0}
      className={
        "h-2 w-2 shrink-0 rounded-full ponto-ciclo transition-colors duration-700 " +
        (props.fase === "atualizando"
          ? "bg-[#ffb300]"
          : "bg-[#0a6b3c]")
      }
      aria-hidden="true"
    />
  );
}

type ChaveGrupo = "ida" | "volta" | "neutro";

const CHAVES_GRUPO = ["neutro", "ida", "volta"] as const;

const ROTULOS_GRUPO: Readonly<Record<ChaveGrupo, string>> = {
  ida: "Ida",
  volta: "Volta",
  neutro: "Outras",
};

// Só favoritas ganham grupo direcional: rastreada não-favorita também tem
// sentido (vem da busca), mas não é favorita — cai em "Outras" com as
// legadas cujo sentido não foi recuperado.
function separarPorSentido(
  favoritas: readonly Linha[],
  outras: readonly Linha[],
): Readonly<Record<ChaveGrupo, readonly Linha[]>> {
  const grupos: Record<ChaveGrupo, Linha[]> = {
    ida: [],
    volta: [],
    neutro: [...outras],
  };
  for (const linha of favoritas) {
    if (linha.sentido === "ida") grupos.ida.push(linha);
    else if (linha.sentido === "volta") grupos.volta.push(linha);
    else grupos.neutro.push(linha);
  }
  return grupos;
}

export function App() {
  const [status, setStatus] = useState<StatusApi | null>(null);
  const [termoBusca, setTermoBusca] = useState("");
  const [resultados, setResultados] = useState<readonly Linha[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [rastreadas, setRastreadas] = useState<readonly Linha[]>([]);
  const [avisoDispensado, setAvisoDispensado] = useState(false);
  const [painel, setPainel] = useState<Linha | null>(null);
  const [mapaExpandido, setMapaExpandido] = useState(false);

  useEffect(() => {
    if (!mapaExpandido) return;
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === "Escape") setMapaExpandido(false);
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [mapaExpandido]);

  useEffect(() => {
    if (!mapaExpandido) return;
    const anterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = anterior;
    };
  }, [mapaExpandido]);

  const pressao = useRef<{
    timer: number | null;
    x: number;
    y: number;
    disparou: boolean;
  }>({ timer: null, x: 0, y: 0, disparou: false });

  function iniciarPressao(linha: Linha, evento: PointerEvent): void {
    cancelarPressao();
    const x = evento.clientX;
    const y = evento.clientY;
    pressao.current = {
      timer: window.setTimeout(() => {
        pressao.current.timer = null;
        pressao.current.disparou = true;
        try {
          navigator.vibrate?.(15);
        } catch {
          /* vibração é opcional */
        }
        setPainel(linha);
      }, 450),
      x,
      y,
      disparou: false,
    };
  }

  function moverPressao(evento: PointerEvent): void {
    const atual = pressao.current;
    if (
      atual.timer !== null &&
      (Math.abs(evento.clientX - atual.x) > 10 ||
        Math.abs(evento.clientY - atual.y) > 10)
    ) {
      cancelarPressao();
    }
  }

  function cancelarPressao(): void {
    if (pressao.current.timer !== null) {
      window.clearTimeout(pressao.current.timer);
      pressao.current.timer = null;
    }
  }

  const posicoes = usePosicoesVarias(rastreadas.map((l) => l.id));
  const rotas = useRotasVarias(rastreadas);
  const { favoritas, alternar, tem } = useFavoritas();

  // Evento de frota chama atenção; ciclo rotineiro não. Aviso transitório
  // sobre o mapa quando a contagem muda de forma significativa.
  const [aviso, setAviso] = useState<{ chave: number; texto: string } | null>(
    null,
  );
  const contagens = useRef<Map<number, number | null>>(new Map());

  useEffect(() => {
    if (rastreadas.length === 0) {
      contagens.current.clear();
      setAviso(null);
      return;
    }
    const amostras = rastreadas.map((l) => ({
      id: l.id,
      letreiro: l.letreiro,
      total: posicoes[l.id]?.dados?.veiculos.length ?? null,
    }));
    const { avisos, proxima } = avisosDeRodada(contagens.current, amostras);
    contagens.current = proxima;
    if (avisos.length > 0) {
      setAviso({ chave: Date.now(), texto: avisos[0].texto });
    }
  }, [posicoes, rastreadas]);

  useEffect(() => {
    if (aviso === null) return;
    const timer = window.setTimeout(() => setAviso(null), 3200);
    return () => window.clearTimeout(timer);
  }, [aviso]);
  const termoPostergado = useValorPostergado(termoBusca.trim(), 350);

  function alternarRastreamento(linha: Linha): void {
    setRastreadas((atuais) =>
      atuais.some((l) => l.id === linha.id)
        ? atuais.filter((l) => l.id !== linha.id)
        : [...atuais, linha],
    );
  }

  function estaRastreando(id: number): boolean {
    return rastreadas.some((l) => l.id === id);
  }

  const conectado = status?.configurado === true;

  useEffect(() => {
    api
      .status()
      .then(setStatus)
      .catch(() => setStatus({ configurado: false }));
  }, []);

  useEffect(() => {
    if (!conectado || termoPostergado.length < 3) {
      setResultados(null);
      setErroBusca(null);
      setBuscando(false);
      return;
    }
    let cancelado = false;
    setBuscando(true);
    api
      .buscarLinhas(termoPostergado)
      .then((linhas) => {
        if (!cancelado) {
          setResultados(linhas);
          setErroBusca(null);
        }
      })
      .catch((excecao: unknown) => {
        if (!cancelado) return;
        setResultados([]);
        setErroBusca(
          excecao instanceof ErroApi
            ? excecao.message
            : "não foi possível buscar linhas",
        );
      })
      .finally(() => {
        if (!cancelado) setBuscando(false);
      });
    return () => {
      cancelado = true;
    };
  }, [conectado, termoPostergado]);

  const rastreadasAvulsas = rastreadas.filter((r) => !tem(r.id));
  const chips = [...favoritas, ...rastreadasAvulsas];
  const porSentido = separarPorSentido(favoritas, rastreadasAvulsas);
  const gruposVisiveis = CHAVES_GRUPO.map((chave) => ({
    chave,
    linhas: porSentido[chave],
  })).filter((g) => g.linhas.length > 0);

  return (
    <div className="flex min-h-dvh flex-col-reverse bg-[#eceeea] text-[#191a1c] md:grid md:h-dvh md:grid-cols-[minmax(320px,380px)_1fr]">
      <aside
        inert={mapaExpandido}
        className="flex flex-col gap-[22px] border-t border-[#dcdedb] bg-[#fbfbfa] p-5 md:h-dvh md:overflow-y-auto md:border-r md:border-t-0"
      >
        <header className="flex items-center justify-between gap-2.5">
          <Led>busão·sp</Led>
        </header>

        {status !== null && !conectado && (
          <p className="-mt-2 m-0 flex flex-wrap items-center gap-1.5 rounded-[10px] border border-dashed border-[#dcdedb] px-3 py-2.5 text-[13px] leading-snug text-[#66696f]">
            <span
              className={pontoVivo + " bg-[#a06d00]"}
              aria-hidden="true"
            />
            Servidor sem token da SPTrans — as buscas não vão funcionar.
          </p>
        )}

        {chips.length > 0 && (
          <nav
            aria-label="Linhas favoritas e rastreadas"
            className="[&>*+*]:mt-4"
          >
            {gruposVisiveis.map((g) => (
              <Fragment key={g.chave}>
                <span className={rotulo}>
                  {g.chave === "ida" && <Predio />}
                  {g.chave === "volta" && <Casa />}
                  {ROTULOS_GRUPO[g.chave]}
                </span>
                <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                  {g.linhas.map((c) => (
                    <li key={c.id} className="flex items-center gap-1">
                      <button
                        type="button"
                        onPointerDown={(e) => iniciarPressao(c, e)}
                        onPointerUp={cancelarPressao}
                        onPointerLeave={cancelarPressao}
                        onPointerCancel={cancelarPressao}
                        onPointerMove={(e) => moverPressao(e)}
                        onContextMenu={(e) => e.preventDefault()}
                        onClick={() => {
                          if (pressao.current.disparou) {
                            pressao.current.disparou = false;
                            return;
                          }
                          alternarRastreamento(c);
                        }}
                        aria-pressed={estaRastreando(c.id)}
                        aria-label={
                          estaRastreando(c.id)
                            ? `Parar de rastrear ${c.letreiro} no mapa`
                            : `Rastrear ${c.letreiro} no mapa`
                        }
                        className={
                          "-mx-1 my-0 flex flex-col items-start rounded-lg bg-gradient-to-b from-[#201e19] to-[#131211] px-3.5 py-1.5 cursor-pointer border-0 select-none [-webkit-touch-callout:none] " +
                          (estaRastreando(c.id)
                            ? "shadow-[inset_0_0_14px_rgba(255,179,0,0.16),0_0_0_2px_#fbfbfa,0_0_0_4px_#ffb300]"
                            : "")
                        }
                      >
                        <span className="font-mono text-[13px] font-black uppercase tracking-[0.08em] text-[#ffb300]">
                          {c.letreiro}
                        </span>
                        <span className="max-w-[180px] overflow-hidden text-ellipsis whitespace-nowrap text-[11px] leading-tight text-[#c9c5ba]">
                          {c.descricao}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={
                          "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border-0 bg-transparent " +
                          (tem(c.id)
                            ? "text-[#a06d00] hover:bg-[#eceeea]"
                            : "text-[#9aa0a6] hover:bg-[#eceeea] hover:text-[#191a1c]")
                        }
                        aria-pressed={tem(c.id)}
                        aria-label={
                          tem(c.id)
                            ? `Remover ${c.letreiro} das favoritas`
                            : `Salvar ${c.letreiro} nas favoritas`
                        }
                        onClick={() => alternar(c)}
                      >
                        <Estrela cheia={tem(c.id)} />
                      </button>
                    </li>
                  ))}
                </ul>
              </Fragment>
            ))}
            {rastreadas.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {rastreadas.map((l) => {
                  const estadoLinha = posicoes[l.id];
                  const dados = estadoLinha?.dados ?? null;
                  const erroRota = rotas[l.id]?.erro;
                  const fase = faseDoCiclo(estadoLinha);
                  const titulo =
                    fase === "ao-vivo" || fase === "atualizando"
                      ? tituloAtualizacao(
                          (estadoLinha?.atualizadoEm ?? null),
                        )
                      : null;
                  return (
                    <p
                      key={l.id}
                      title={titulo ?? undefined}
                      className="m-0 flex items-center gap-1.5 text-xs"
                    >
                      <span className="font-mono font-black">{l.letreiro}</span>
                      {estadoLinha?.erro !== null &&
                      estadoLinha?.erro !== undefined ? (
                        <span className="text-[#bf3b2b]">
                          {estadoLinha.erro}
                        </span>
                      ) : dados === null ? (
                        <span className="text-[#66696f]">
                          buscando ônibus…
                        </span>
                      ) : (
                        <>
                          <PontoCiclo
                            fase={fase}
                            momento={estadoLinha?.atualizadoEm ?? null}
                          />
                          <span className="text-[#66696f]">
                            ao vivo · {dados.horario} ·{" "}
                            {dados.veiculos.length} ônibus
                          </span>
                        </>
                      )}
                      {erroRota !== null && erroRota !== undefined && (
                        <span className="text-[#bf3b2b]">
                          trajeto indisponível
                        </span>
                      )}
                    </p>
                  );
                })}
              </div>
            )}
          </nav>
        )}

        <div>
          <label className={rotulo} htmlFor="campo-busca">
            Buscar linha
          </label>
          <input
            id="campo-busca"
            type="search"
            placeholder="número ou nome · ex.: 8000 ou Paulista"
            autoComplete="off"
            value={termoBusca}
            onInput={(e) => setTermoBusca((e.target as HTMLInputElement).value)}
            className="w-full rounded-[10px] border border-[#dcdedb] bg-white px-3.5 py-3 text-[15px] text-[#191a1c] outline-none placeholder:text-[#9aa0a6] focus:border-[#ffb300] focus:ring-2 focus:ring-[#ffb300]"
          />
        </div>

        <section aria-live="polite">
          {resultados === null &&
            conectado &&
            !buscando &&
            erroBusca === null && (
              <p className="m-0 text-[13px] text-[#66696f]">
                Busque pelo número ou nome da linha. Ex.:{" "}
                <code className="rounded bg-[#eceeea] px-1.5 py-0.5 font-mono text-[13px]">
                  8000
                </code>
                ,{" "}
                <code className="rounded bg-[#eceeea] px-1.5 py-0.5 font-mono text-[13px]">
                  N106
                </code>{" "}
                ou{" "}
                <code className="rounded bg-[#eceeea] px-1.5 py-0.5 font-mono text-[13px]">
                  Paulista
                </code>
                .
              </p>
            )}
          {buscando && (
            <p className="m-0 text-[13px] text-[#66696f]">buscando…</p>
          )}
          {erroBusca !== null && (
            <p className="m-0 text-[13px] text-[#bf3b2b]">{erroBusca}</p>
          )}
          {resultados !== null &&
            !buscando &&
            resultados.length === 0 &&
            erroBusca === null && (
              <p className="m-0 text-[13px] text-[#66696f]">
                Nenhuma linha encontrada para “{termoPostergado}”.
              </p>
            )}
          {resultados !== null && resultados.length > 0 && (
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              {resultados.map((l) => (
                <li key={l.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => alternarRastreamento(l)}
                    aria-pressed={estaRastreando(l.id)}
                    className={
                      "block min-w-0 flex-1 rounded-[10px] border-0 px-[11px] py-[9px] text-left " +
                      (estaRastreando(l.id)
                        ? "cursor-pointer bg-[#fff7e0] shadow-[inset_0_0_0_2px_#ffb300]"
                        : "cursor-pointer bg-transparent hover:bg-[#eceeea]")
                    }
                  >
                    <span className="block font-mono text-base font-black tracking-[0.04em]">
                      {l.letreiro}
                    </span>
                    <span className="block truncate text-[13px] text-[#66696f]">
                      {l.descricao}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={
                      "flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-lg border-0 bg-transparent " +
                      (tem(l.id)
                        ? "text-[#a06d00] hover:bg-[#eceeea]"
                        : "text-[#9aa0a6] hover:bg-[#eceeea] hover:text-[#191a1c]")
                    }
                    aria-pressed={tem(l.id)}
                    aria-label={
                      tem(l.id)
                        ? `Remover ${l.letreiro} das favoritas`
                        : `Salvar ${l.letreiro} nas favoritas`
                    }
                    onClick={() => alternar(l)}
                  >
                    <Estrela cheia={tem(l.id)} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </aside>

      <main
        className={
          "flex shrink-0 " +
          (mapaExpandido
            ? "fixed inset-0 z-50 h-dvh"
            : "relative h-[44dvh] md:h-dvh")
        }
      >
        <Mapa
          linhas={rastreadas}
          posicoes={posicoes}
          rotas={rotas}
          expandido={mapaExpandido}
          aoAlternarExpansao={() => setMapaExpandido((atual) => !atual)}
        />

        {rastreadas.length === 0 && !avisoDispensado && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="pointer-events-auto relative max-w-[320px] rounded-2xl bg-[#fbfbfa] px-[30px] py-7 text-center shadow-[0_10px_40px_rgba(23,24,26,0.18)]">
              <button
                type="button"
                onClick={() => setAvisoDispensado(true)}
                aria-label="Dispensar aviso"
                className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg border-0 bg-transparent p-0 text-[#9aa0a6] hover:bg-[#eceeea] hover:text-[#191a1c]"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
              <Led classe="text-2xl">busão·sp</Led>
              <p className="m-0 mt-3.5 text-sm text-[#66696f]">
                Busque pelo número ou nome da linha para ver os ônibus em
                circulação agora.
              </p>
            </div>
          </div>
        )}
        {painel !== null && (
          <PainelHorarios linha={painel} aoFechar={() => setPainel(null)} />
        )}
        {aviso !== null && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2">
            <p
              key={aviso.chave}
              role="status"
              className="pill-ciclo m-0 whitespace-nowrap rounded-full bg-neutral-900/95 px-4 py-1.5 font-mono text-xs font-bold text-amber-300 shadow-[0_6px_24px_rgba(23,24,26,0.35)]"
            >
              {aviso.texto}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
