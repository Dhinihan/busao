import { useEffect, useRef, useState } from "preact/hooks";
import { api, ErroApi } from "./api";
import { corDoLetreiro } from "../shared/regioes.ts";
import { NOMES_POR_LETREIRO } from "../shared/nomes.ts";
import { useDialogoModal } from "./hooks";
import type { Parada } from "../shared/paradas";
import type { Linha, PrevisaoParada } from "../shared/tipos.ts";

function doisDigitos(valor: number): string {
  return String(valor).padStart(2, "0");
}

function horaLocal(quando: Date): string {
  return `${doisDigitos(quando.getHours())}:${doisDigitos(quando.getMinutes())}:${doisDigitos(quando.getSeconds())}`;
}

type EstadoPrevisao = {
  readonly dados: PrevisaoParada | null;
  readonly atualizadoEm: Date | null;
  readonly erro: string | null;
};

const SEM_PREVISAO: EstadoPrevisao = {
  dados: null,
  atualizadoEm: null,
  erro: null,
};

export function PainelParada(props: {
  readonly parada: Parada;
  readonly aoFechar: () => void;
  readonly aoRastrear: (linha: Linha) => void;
  readonly estaRastreando: (id: number) => boolean;
}) {
  const { parada, aoFechar, aoRastrear, estaRastreando } = props;
  const { secaoRef } = useDialogoModal();
  const [previsao, setPrevisao] = useState<EstadoPrevisao>(SEM_PREVISAO);
  const [buscando, setBuscando] = useState(false);
  const [rodada, setRodada] = useState(0);
  const [letreiroAberto, setLetreiroAberto] = useState<string | null>(null);
  const [linhasDoLetreiro, setLinhasDoLetreiro] = useState<
    readonly Linha[] | null
  >(null);
  const [erroLinhas, setErroLinhas] = useState<string | null>(null);
  const fileiraAbertaRef = useRef<HTMLLIElement | null>(null);

  // Previsão sem polling: busca ao abrir o painel e só de novo por clique
  // em "atualizar". Reabrir o painel busca de novo — 1 request por ação.
  const cp = parada.cp;
  useEffect(() => {
    if (cp === null) return;
    let cancelado = false;
    const controle = new AbortController();
    const tempoEsgotado = window.setTimeout(() => controle.abort(), 8_000);
    setBuscando(true);
    setPrevisao(SEM_PREVISAO);
    api
      .previsao(cp, { sinal: controle.signal })
      .then((dados) => {
        if (!cancelado) {
          setPrevisao({ dados, atualizadoEm: new Date(), erro: null });
          setBuscando(false);
        }
      })
      .catch((excecao: unknown) => {
        if (cancelado) return;
        setPrevisao({
          dados: null,
          atualizadoEm: null,
          erro:
            excecao instanceof ErroApi
              ? excecao.message
              : "não foi possível buscar previsões",
        });
        setBuscando(false);
      });
    return () => {
      cancelado = true;
      window.clearTimeout(tempoEsgotado);
      controle.abort();
    };
  }, [cp, rodada]);

  useEffect(() => {
    // Zera antes de qualquer busca: sem isso, ao trocar de linha a fileira
    // nova exibiria (e deixaria rastrear) os sentidos da anterior.
    setLinhasDoLetreiro(null);
    setErroLinhas(null);
    if (letreiroAberto === null) return;
    let cancelado = false;
    const controle = new AbortController();
    api
      .buscarLinhas(letreiroAberto, { sinal: controle.signal })
      .then((linhas) => {
        if (!cancelado) setLinhasDoLetreiro(linhas);
      })
      .catch((excecao: unknown) => {
        if (cancelado) return;
        setLinhasDoLetreiro([]);
        setErroLinhas(
          excecao instanceof ErroApi
            ? excecao.message
            : "não foi possível buscar as linhas",
        );
      });
    return () => {
      cancelado = true;
      controle.abort();
    };
  }, [letreiroAberto]);

  // A lista de linhas rola sozinha: mantém à vista a fileira aberta e seus
  // sentidos, que crescem quando a busca termina.
  useEffect(() => {
    fileiraAbertaRef.current?.scrollIntoView({ block: "nearest" });
  }, [letreiroAberto, linhasDoLetreiro, erroLinhas]);

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent): void {
      if (evento.key === "Escape") aoFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const nome = previsao.dados?.nome ?? "";
  const comPrevisao = (previsao.dados?.linhas ?? []).filter(
    (l) => l.previsoes.length > 0,
  );
  const semPrevisao = (previsao.dados?.linhas ?? []).filter(
    (l) => l.previsoes.length === 0,
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={aoFechar}
    >
      <section
        ref={secaoRef}
        tabIndex={-1}        role="dialog"
        aria-modal="true"
        aria-label="Ponto de ônibus"
        className="max-h-[80dvh] w-full max-w-[430px] overflow-y-auto rounded-t-2xl bg-[#fbfbfa] px-5 pb-8 pt-4 shadow-[0_-10px_40px_rgba(23,24,26,0.25)] outline-none"
        onClick={(evento) => evento.stopPropagation()}
      >
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="block font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#66696f]">
              ponto de ônibus
            </span>
            <p className="m-0 mt-0.5 truncate text-[15px] font-bold text-[#191a1c]">
              {nome !== "" ? nome : "Parada"}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar painel do ponto"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border-0 bg-transparent p-0 text-[#9aa0a6] hover:bg-[#eceeea] hover:text-[#191a1c]"
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
        </header>

        {parada.letreiros.length > 0 && (
          <div className="mb-4">
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#66696f]">
              linhas que passam aqui
            </span>
            <ul className="m-0 flex max-h-[236px] list-none flex-col overflow-y-auto overscroll-contain p-0">
              {parada.letreiros.map((letreiro) => {
                const cor = corDoLetreiro(letreiro);
                const nomeLinha = NOMES_POR_LETREIRO[letreiro];
                const aberto = letreiroAberto === letreiro;
                return (
                  <li
                    key={letreiro}
                    ref={aberto ? fileiraAbertaRef : undefined}
                    className="border-b border-[#eceeea] last:border-b-0"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setLetreiroAberto((atual) =>
                          atual === letreiro ? null : letreiro,
                        )
                      }
                      aria-expanded={aberto}
                      title={nomeLinha}
                      className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-1 py-2 text-left hover:bg-[#eceeea]"
                    >
                      <span
                        className="w-[52px] shrink-0 rounded-md py-1 text-center font-mono text-[12px] font-bold text-white shadow-[inset_0_-1px_0_rgba(0,0,0,0.2)]"
                        style={{ backgroundColor: cor ?? "#6b6f76" }}
                      >
                        {letreiro}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-[#191a1c]">
                        {nomeLinha !== undefined ? (
                          nomeLinha
                        ) : (
                          <span className="text-[#9aa0a6]">sem nome no quadro</span>
                        )}
                      </span>
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        fill="none"
                        stroke="#9aa0a6"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={"shrink-0 transition-transform " + (aberto ? "rotate-180" : "")}
                      >
                        <path d="M6 9l6 6 6-6" />
                      </svg>
                    </button>
                    {aberto && (
                      <div className="mb-2 ml-[62px] rounded-[10px] border border-[#dcdedb] bg-white p-2">
                        {erroLinhas !== null && (
                          <p className="m-0 text-[13px] text-[#bf3b2b]">{erroLinhas}</p>
                        )}
                        {linhasDoLetreiro === null && erroLinhas === null && (
                          <p className="m-0 text-[13px] text-[#66696f]">buscando sentidos…</p>
                        )}
                        {linhasDoLetreiro !== null && linhasDoLetreiro.length === 0 && erroLinhas === null && (
                          <p className="m-0 text-[13px] text-[#66696f]">
                            nenhuma linha ativa encontrada com esse letreiro.
                          </p>
                        )}
                        {linhasDoLetreiro !== null &&
                          linhasDoLetreiro.map((linha) => (
                            <button
                              key={linha.id}
                              type="button"
                              onClick={() => aoRastrear(linha)}
                              aria-pressed={estaRastreando(linha.id)}
                              className={
                                "flex w-full cursor-pointer items-center gap-2 rounded-lg border-0 px-2 py-1.5 text-left " +
                                (estaRastreando(linha.id)
                                  ? "bg-[#fff7e0] shadow-[inset_0_0_0_2px_#ffb300]"
                                  : "bg-transparent hover:bg-[#eceeea]")
                              }
                            >
                              <span className="min-w-0 flex-1 truncate text-[12px] text-[#191a1c]">
                                <span className="font-mono font-bold">{linha.letreiro}</span>{" "}
                                → {linha.descricao || "—"}
                              </span>
                              <span className="shrink-0 text-[11px] font-semibold">
                                {estaRastreando(linha.id) ? "rastreando" : "rastrear →"}
                              </span>
                            </button>
                          ))}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        <div>
          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#66696f]">
            previsão de chegada
          </span>

          {cp === null && (
            <p className="m-0 text-[13px] leading-snug text-[#66696f]">
              a SPTrans só publica previsão de chegada para os pontos de
              corredor — neste ponto ficam só as linhas do quadro.
            </p>
          )}

          {cp !== null && buscando && (
            <p className="m-0 text-[13px] text-[#66696f]">buscando previsões…</p>
          )}

          {cp !== null && !buscando && previsao.erro !== null && (
            <p className="m-0 text-[13px] leading-snug text-[#bf3b2b]">
              {previsao.erro}
            </p>
          )}

          {cp !== null && !buscando && previsao.erro === null && (
            <>
              {comPrevisao.length === 0 ? (
                <p className="m-0 text-[13px] text-[#66696f]">
                  nenhuma previsão de chegada agora.
                </p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {comPrevisao.map((linha) => {
                    const cor = corDoLetreiro(linha.letreiro);
                    return (
                      <li
                        key={linha.cl}
                        className="flex items-baseline justify-between gap-2 border-b border-[#eceeea] pb-2 last:border-b-0 last:pb-0"
                      >
                        <span className="min-w-0">
                          <span
                            className="mr-1.5 inline-block rounded px-1.5 py-0.5 font-mono text-[11px] font-bold text-white"
                            style={{ backgroundColor: cor ?? "#6b6f76" }}
                          >
                            {linha.letreiro}
                          </span>
                          <span className="text-[12px] text-[#66696f]">
                            {linha.destino !== "" ? linha.destino : "—"}
                          </span>
                        </span>
                        <span className="flex shrink-0 gap-1">
                          {linha.previsoes.slice(0, 3).map((chegada, i) => (
                            <span
                              key={`${linha.cl}-${chegada.prefixo}-${i}`}
                              className={
                                "rounded-md px-1.5 py-0.5 font-mono text-[12px] font-bold " +
                                (i === 0
                                  ? "bg-[#ffb300] text-[#131211]"
                                  : "bg-[#eceeea] text-[#191a1c]")
                              }
                            >
                              {chegada.horario}
                            </span>
                          ))}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
              {semPrevisao.length > 0 && (
                <p className="m-0 mt-2 text-[11px] leading-snug text-[#9aa0a6]">
                  sem ônibus a caminho agora:{" "}
                  {semPrevisao.map((l) => l.letreiro).join(", ")}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#9aa0a6]">
                  {previsao.atualizadoEm !== null
                    ? `atualizado às ${horaLocal(previsao.atualizadoEm)}`
                    : null}
                </span>
                <button
                  type="button"
                  onClick={() => setRodada((r) => r + 1)}
                  className="cursor-pointer rounded-lg border border-[#dcdedb] bg-white px-3 py-1 text-[12px] font-semibold text-[#191a1c] hover:border-[#a06d00]"
                >
                  atualizar
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
