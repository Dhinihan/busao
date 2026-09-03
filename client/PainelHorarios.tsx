import { useEffect, useState } from "preact/hooks";
import {
  ErroQuadroAusente,
  apiHorarios,
  minutosAte,
  proximasPartidas,
  tipoDiaDe,
} from "./horarios.ts";
import { useDialogoModal } from "./hooks";
import type { QuadroHorarios, TipoDia } from "./horarios.ts";
import type { Linha } from "../shared/tipos.ts";

const ROTULO_TIPO_DIA: Readonly<Record<TipoDia, string>> = {
  util: "dia útil",
  sab: "sábado",
  dom: "domingo",
};

type EstadoPainel = {
  readonly quadro: QuadroHorarios | null;
  readonly erro: string | null;
};

const SEM_QUADRO: EstadoPainel = { quadro: null, erro: null };

export function PainelHorarios(props: {
  readonly linha: Linha;
  readonly aoFechar: () => void;
}) {
  const { linha, aoFechar } = props;
  const { secaoRef } = useDialogoModal();
  const [estado, setEstado] = useState<EstadoPainel>(SEM_QUADRO);
  const [agora, setAgora] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => setAgora(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let cancelado = false;
    setEstado(SEM_QUADRO);
    apiHorarios(linha.id)
      .then((quadro) => {
        if (!cancelado) setEstado({ quadro, erro: null });
      })
      .catch((excecao: unknown) => {
        if (cancelado) return;
        setEstado({
          quadro: null,
          erro:
            excecao instanceof ErroQuadroAusente
              ? "A SPTrans não publica quadro de horários para esta linha."
              : "Não foi possível carregar o quadro agora. Tente de novo.",
        });
      });
    return () => {
      cancelado = true;
    };
  }, [linha.id]);

  useEffect(() => {
    function aoTeclar(evento: KeyboardEvent): void {
      if (evento.key === "Escape") aoFechar();
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aoFechar]);

  const tipo = tipoDiaDe(agora);
  const agoraMin = agora.getHours() * 60 + agora.getMinutes();
  const partidas = estado.quadro
    ? proximasPartidas(estado.quadro.tipo_dia[tipo] ?? [], agoraMin)
    : [];
  const proxima = partidas[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
      onClick={aoFechar}
    >
      <section
        ref={secaoRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Horários de saída da linha ${linha.letreiro}`}
        className="w-full max-w-[430px] rounded-t-2xl bg-[#fbfbfa] px-5 pb-8 pt-4 shadow-[0_-10px_40px_rgba(23,24,26,0.25)] outline-none"
        onClick={(evento) => evento.stopPropagation()}
      >
        <header className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <span className="font-mono text-xl font-black uppercase tracking-[0.06em]">
              {linha.letreiro}
            </span>
            <p className="m-0 mt-0.5 truncate text-[13px] text-[#66696f]">
              {estado.quadro
                ? `saídas de ${estado.quadro.origem.toLocaleLowerCase()} · ${ROTULO_TIPO_DIA[tipo]}`
                : `saídas do ponto inicial · ${ROTULO_TIPO_DIA[tipo]}`}
            </p>
          </div>
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar horários"
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

        {estado.erro !== null && (
          <p className="m-0 text-[14px] leading-snug text-[#bf3b2b]">
            {estado.erro}
          </p>
        )}

        {estado.erro === null && estado.quadro === null && (
          <p className="m-0 text-[14px] text-[#66696f]">buscando quadro…</p>
        )}

        {estado.quadro !== null && partidas.length === 0 && (
          <p className="m-0 text-[14px] leading-snug text-[#66696f]">
            {(estado.quadro.tipo_dia[tipo]?.length ?? 0) > 0
              ? "As partidas de hoje já terminaram."
              : `Sem partidas previstas para ${ROTULO_TIPO_DIA[tipo]}.`}
          </p>
        )}

        {partidas.length > 0 && (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {partidas.map((partida) => {
              const falta = minutosAte(partida, agoraMin);
              const ehProxima = partida === proxima;
              return (
                <li key={partida}>
                  <span
                    className={
                      "inline-block rounded-lg px-2 py-1 font-mono text-sm font-bold " +
                      (ehProxima
                        ? "bg-[#ffb300] text-[#131211]"
                        : "bg-[#eceeea] text-[#191a1c]")
                    }
                  >
                    {partida}
                    {ehProxima && falta !== null && (
                      <span className="ml-1 font-sans text-[11px] font-semibold">
                        em {falta} min
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        {estado.quadro !== null && (
          <p className="m-0 mt-4 text-[11px] text-[#9aa0a6]">
            quadro programado SPTrans · GTFS de {estado.quadro.feed_em} ·
            horários estimados, sem garantia
          </p>
        )}
      </section>
    </div>
  );
}
