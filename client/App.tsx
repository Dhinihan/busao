import { useEffect, useState } from "preact/hooks";
import { api, ErroApi } from "./api";
import { Estrela } from "./Estrela";
import { Mapa } from "./Mapa";
import { useFavoritas, usePosicoes, useValorPostergado } from "./hooks";
import type { Linha, StatusApi } from "../shared/tipos.ts";

export function App() {
  const [status, setStatus] = useState<StatusApi | null>(null);
  const [termoBusca, setTermoBusca] = useState("");
  const [resultados, setResultados] = useState<readonly Linha[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erroBusca, setErroBusca] = useState<string | null>(null);
  const [linhaAtiva, setLinhaAtiva] = useState<Linha | null>(null);

  const estadoPosicoes = usePosicoes(linhaAtiva?.id ?? null);
  const { favoritas, alternar, tem } = useFavoritas();
  const termoPostergado = useValorPostergado(termoBusca.trim(), 350);

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
        if (cancelado) return;
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

  function selecionarLinha(linha: Linha): void {
    setLinhaAtiva(linha);
  }

  return (
    <main className="flex h-dvh flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <span className="shrink-0 font-mono text-sm font-bold">busão·sp</span>
        <input
          type="search"
          placeholder="número ou nome · ex.: 8000 ou Paulista"
          autoComplete="off"
          value={termoBusca}
          onInput={(e) => setTermoBusca((e.target as HTMLInputElement).value)}
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm outline-none focus:border-amber-400"
        />
      </header>

      {status !== null && !conectado && (
        <p className="border-b border-neutral-800 bg-neutral-900 px-3 py-1.5 text-xs text-amber-300">
          Servidor sem token da SPTrans — as buscas não vão funcionar.
        </p>
      )}

      {favoritas.length > 0 && (
        <nav
          aria-label="Linhas favoritas"
          className="flex gap-1 overflow-x-auto border-b border-neutral-800 px-3 py-1.5"
        >
          {favoritas.map((f) => (
            <span key={f.id} className="flex shrink-0 items-center">
              <button
                type="button"
                className={
                  "rounded-l px-2 py-1 font-mono text-xs " +
                  (linhaAtiva?.id === f.id
                    ? "bg-amber-400 text-black"
                    : "border border-neutral-700 text-neutral-300")
                }
                onClick={() => selecionarLinha(f)}
              >
                {f.letreiro}
              </button>
              <button
                type="button"
                aria-label={`Remover ${f.letreiro} das favoritas`}
                className={
                  "h-[26px] rounded-r border border-l-0 px-1 text-neutral-400 " +
                  (linhaAtiva?.id === f.id
                    ? "border-amber-400"
                    : "border-neutral-700")
                }
                onClick={() => alternar(f)}
              >
                <Estrela cheia />
              </button>
            </span>
          ))}
        </nav>
      )}

      <section
        aria-live="polite"
        className={
          "overflow-y-auto border-b border-neutral-800 bg-neutral-900/60 " +
          ((resultados !== null && resultados.length > 0 && !buscando) ||
          erroBusca !== null ||
          buscando
            ? ""
            : "hidden")
        }
      >
        {buscando && (
          <p className="px-3 py-2 text-xs text-neutral-400">buscando…</p>
        )}
        {erroBusca !== null && (
          <p className="px-3 py-2 text-xs text-red-300">{erroBusca}</p>
        )}
        {resultados !== null &&
          !buscando &&
          resultados.length === 0 &&
          erroBusca === null && (
            <p className="px-3 py-2 text-xs text-neutral-400">
              Nenhuma linha encontrada para “{termoPostergado}”.
            </p>
          )}
        {resultados !== null && resultados.length > 0 && !buscando && (
          <ul>
            {resultados.map((l) => (
              <li key={l.id} className="flex items-center border-b border-neutral-800/60 last:border-b-0">
                <button
                  type="button"
                  className={
                    "min-w-0 flex-1 px-3 py-2 text-left " +
                    (linhaAtiva?.id === l.id ? "bg-neutral-800" : "")
                  }
                  onClick={() => selecionarLinha(l)}
                >
                  <span className="block font-mono text-sm text-amber-300">
                    {l.letreiro}
                  </span>
                  <span className="block truncate text-xs text-neutral-400">
                    {l.descricao}
                  </span>
                </button>
                <button
                  type="button"
                  className={
                    "mx-2 shrink-0 " + (tem(l.id) ? "text-amber-400" : "text-neutral-500")
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

      <div className="relative flex min-h-0 flex-1 flex-col">
        <Mapa linha={linhaAtiva} estado={estadoPosicoes} />

        {linhaAtiva !== null && (
          <section
            aria-label="Linha selecionada"
            className="absolute left-2 top-2 max-w-[280px] rounded border border-neutral-700 bg-black/85 px-3 py-2"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-bold text-amber-300">
                {linhaAtiva.letreiro}
              </span>
              <button
                type="button"
                className={
                  "ml-auto " + (tem(linhaAtiva.id) ? "text-amber-400" : "text-neutral-500")
                }
                aria-pressed={tem(linhaAtiva.id)}
                aria-label={
                  tem(linhaAtiva.id)
                    ? `Remover ${linhaAtiva.letreiro} das favoritas`
                    : `Salvar ${linhaAtiva.letreiro} nas favoritas`
                }
                onClick={() => alternar(linhaAtiva)}
              >
                <Estrela cheia={tem(linhaAtiva.id)} />
              </button>
              <button
                type="button"
                aria-label="Fechar linha ativa"
                className="px-1 text-lg leading-none text-neutral-400"
                onClick={() => setLinhaAtiva(null)}
              >
                ×
              </button>
            </div>
            <p className="truncate text-xs text-neutral-300">
              {linhaAtiva.descricao}
            </p>
            <p className="mt-1 text-xs">
              {estadoPosicoes.erro !== null ? (
                <span className="text-red-300">{estadoPosicoes.erro}</span>
              ) : estadoPosicoes.dados === null ? (
                <span className="text-neutral-400">buscando ônibus…</span>
              ) : (
                <span className="text-emerald-300">
                  ao vivo · {estadoPosicoes.dados.horario} ·{" "}
                  {estadoPosicoes.dados.veiculos.length}{" "}
                  {estadoPosicoes.dados.veiculos.length === 1
                    ? "ônibus"
                    : "ônibus"}
                </span>
              )}
            </p>
          </section>
        )}

        {linhaAtiva === null && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4">
            <div className="max-w-[260px] rounded border border-neutral-700 bg-black/85 px-4 py-3 text-center">
              <span className="font-mono text-sm font-bold">busão·sp</span>
              <p className="mt-1 text-xs text-neutral-300">
                Busque pelo número ou nome da linha para ver os ônibus em
                circulação agora.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
