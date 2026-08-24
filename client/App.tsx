import { useEffect, useState } from "preact/hooks";
import { api, ErroApi } from "./api";
import { Estrela } from "./Estrela";
import { Mapa } from "./Mapa";
import { useFavoritas, usePosicoesVarias, useValorPostergado } from "./hooks";
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

export function App() {
  const [status, setStatus] = useState<StatusApi | null>(null);
  const [termoBusca, setTermoBusca] = useState("");
  const [resultados, setResultados] = useState<readonly Linha[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [rastreadas, setRastreadas] = useState<readonly Linha[]>([]);

  const posicoes = usePosicoesVarias(rastreadas.map((l) => l.id));
  const { favoritas, alternar, tem } = useFavoritas();
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

  const chips = [
    ...favoritas,
    ...rastreadas.filter((r) => !tem(r.id)),
  ];

  return (
    <div className="flex min-h-dvh flex-col-reverse bg-[#eceeea] text-[#191a1c] md:grid md:h-dvh md:grid-cols-[minmax(320px,380px)_1fr]">
      <aside className="flex flex-col gap-[22px] border-t border-[#dcdedb] bg-[#fbfbfa] p-5 md:h-dvh md:overflow-y-auto md:border-r md:border-t-0">
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
          <nav aria-label="Linhas favoritas e rastreadas">
            <span className={rotulo}>Favoritas</span>
            <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
              {chips.map((c) => (
                <li key={c.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => alternarRastreamento(c)}
                    aria-pressed={estaRastreando(c.id)}
                    aria-label={
                      estaRastreando(c.id)
                        ? `Parar de rastrear ${c.letreiro} no mapa`
                        : `Rastrear ${c.letreiro} no mapa`
                    }
                    className={
                      "-mx-1 my-0 flex flex-col items-start rounded-lg bg-gradient-to-b from-[#201e19] to-[#131211] px-3.5 py-1.5 cursor-pointer border-0 " +
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
            {rastreadas.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                {rastreadas.map((l) => {
                  const estadoLinha = posicoes[l.id];
                  const dados = estadoLinha?.dados ?? null;
                  return (
                    <p
                      key={l.id}
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
                          <span
                            className={pontoVivo + " bg-[#0a6b3c]"}
                            aria-hidden="true"
                          />
                          <span className="text-[#66696f]">
                            ao vivo · {dados.horario} ·{" "}
                            {dados.veiculos.length} ônibus
                          </span>
                        </>
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

      <main className="relative flex h-[44dvh] shrink-0 md:h-dvh">
        <Mapa linhas={rastreadas} posicoes={posicoes} />

        {rastreadas.length === 0 && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="pointer-events-auto max-w-[320px] rounded-2xl bg-[#fbfbfa] px-[30px] py-7 text-center shadow-[0_10px_40px_rgba(23,24,26,0.18)]">
              <Led classe="text-2xl">busão·sp</Led>
              <p className="m-0 mt-3.5 text-sm text-[#66696f]">
                Busque pelo número ou nome da linha para ver os ônibus em
                circulação agora.
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

