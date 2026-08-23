import { useEffect, useRef, useState } from "preact/hooks";
import {
  deslocarMundo,
  enquadrarPontos,
  pontoParaPixelDeTela,
  tilesVisiveis,
  type Ponto,
} from "../shared/tile-math";
import { useLocalizacao, type EstadoPosicoes } from "./hooks";
import type { Linha } from "../shared/tipos.ts";

const ZOOM_MINIMO = 0;
const ZOOM_MAXIMO = 18;

const pontoVivoMapa =
  "h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#0a6b3c] motion-reduce:animate-none";

export function Mapa(props: {
  linha: Linha | null;
  estado: EstadoPosicoes;
}) {
  const { linha, estado } = props;
  const veiculos = estado.dados?.veiculos ?? [];

  const [quadro, setQuadro] = useState<Ponto & { zoom: number }>({
    lat: -23.5505,
    lng: -46.6333,
    zoom: 12,
  });
  const [tamanho, setTamanho] = useState({ largura: 0, altura: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);
  const arrasteRef = useRef<{
    x: number;
    y: number;
    centro: Ponto;
  } | null>(null);
  const enquadrouAte = useRef<number | null>(null);
  const centralizouRef = useRef(false);
  const localizacao = useLocalizacao();

  useEffect(() => {
    const elemento = containerRef.current;
    if (elemento === null) return;
    const medir = () =>
      setTamanho({
        largura: elemento.clientWidth,
        altura: elemento.clientHeight,
      });
    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(elemento);
    return () => observador.disconnect();
  }, []);

  useEffect(() => {
    if (linha === null || tamanho.largura === 0) return;
    if (enquadrouAte.current === linha.id) return;
    if (veiculos.length === 0) return;
    enquadrouAte.current = linha.id;
    setQuadro(
      enquadrarPontos(veiculos, {
        largura: tamanho.largura,
        altura: tamanho.altura,
      }),
    );
  }, [linha, tamanho.largura, tamanho.altura, veiculos]);

  useEffect(() => {
    if (!localizacao.ativa) centralizouRef.current = false;
  }, [localizacao.ativa]);

  useEffect(() => {
    const ponto = localizacao.estado.ponto;
    if (ponto === null) return;
    if (centralizouRef.current) return;
    centralizouRef.current = true;
    setQuadro((atual) => ({
      ...pontoParaQuadro(ponto),
      zoom: Math.max(atual.zoom, 16),
    }));
  }, [localizacao.estado.ponto]);

  function aoPressionar(evento: PointerEvent) {
    const alvo = evento.target as HTMLElement | null;
    if (alvo !== null && alvo.closest("button, a") !== null) return;
    evento.preventDefault();
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
    arrasteRef.current = { x: evento.clientX, y: evento.clientY, centro: quadro };
  }

  function aoArrastar(evento: PointerEvent) {
    const arraste = arrasteRef.current;
    if (arraste === null) return;
    const dx = evento.clientX - arraste.x;
    const dy = evento.clientY - arraste.y;
    const novo = deslocarMundo(arraste.centro, -dx, -dy, quadro.zoom);
    setQuadro({ ...novo, zoom: quadro.zoom });
  }

  function aoSoltar() {
    arrasteRef.current = null;
  }

  function alternarZoom(delta: number) {
    setQuadro((atual) => ({
      ...atual,
      zoom: Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, atual.zoom + delta)),
    }));
  }

  const tiles =
    tamanho.largura > 0
      ? tilesVisiveis({
          centro: quadro,
          zoom: quadro.zoom,
          largura: tamanho.largura,
          altura: tamanho.altura,
        })
      : [];

  return (
    <div
      ref={containerRef}
      className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-[#eceeea]"
      onPointerDown={aoPressionar}
      onPointerMove={aoArrastar}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
    >
      {tiles.map((tile) => (
        <img
          key={`${tile.z}/${tile.x}/${tile.y}`}
          alt=""
          draggable={false}
          loading="eager"
          src={`https://tile.openstreetmap.org/${tile.z}/${tile.x}/${tile.y}.png`}
          style={{
            position: "absolute",
            left: `${tile.esquerda}px`,
            top: `${tile.topo}px`,
            width: "256px",
            height: "256px",
            filter: "grayscale(1) contrast(1.05) brightness(1.02)",
          }}
        />
      ))}

      {veiculos.map((veiculo) => {
        const tela = pontoParaPixelDeTela(veiculo, {
          centro: quadro,
          zoom: quadro.zoom,
          largura: tamanho.largura,
          altura: tamanho.altura,
        });
        return (
          <div
            key={veiculo.prefixo}
            className="group absolute"
            style={{ left: `${tela.x}px`, top: `${tela.y}px` }}
          >
            <div
              className="h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-neutral-900 bg-amber-400"
              title={veiculo.prefixo + (veiculo.acessivel ? " · acessível" : "")}
            />
            <div className="pointer-events-none absolute left-3 top-[-8px] hidden whitespace-nowrap rounded-md border border-[#dcdedb] bg-[#fbfbfa] px-1.5 py-0.5 font-mono text-xs text-[#191a1c] shadow-[0_2px_8px_rgba(23,24,26,0.15)] group-hover:block">
              {veiculo.prefixo}
              {veiculo.acessivel ? " · acessível" : ""}
            </div>
          </div>
        );
      })}

      {localizacao.estado.ponto !== null &&
        (() => {
          const [lat, lng] = localizacao.estado.ponto;
          const tela = pontoParaPixelDeTela(
            { lat, lng },
            {
              centro: quadro,
              zoom: quadro.zoom,
              largura: tamanho.largura,
              altura: tamanho.altura,
            },
          );
          return (
            <div
              className="absolute"
              style={{ left: `${tela.x}px`, top: `${tela.y}px` }}
            >
              <div className="h-[16px] w-[16px] -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-white bg-blue-600 shadow" />
            </div>
          );
        })()}

      <div className="absolute right-3 top-3 flex flex-col items-end gap-2">
        <div className="flex flex-col overflow-hidden rounded-lg border border-[#dcdedb] shadow-[0_2px_10px_rgba(23,24,26,0.12)]">
          <button
            type="button"
            className="h-8 w-8 border-0 bg-white text-lg leading-none text-[#191a1c] hover:bg-[#eceeea]"
            onClick={() => alternarZoom(1)}
          >
            +
          </button>
          <button
            type="button"
            className="h-8 w-8 border-0 border-t border-t-[#dcdedb] bg-white text-lg leading-none text-[#191a1c] hover:bg-[#eceeea]"
            onClick={() => alternarZoom(-1)}
          >
            −
          </button>
        </div>
        <button
          type="button"
          className={
            "inline-flex items-center gap-2 rounded-full border bg-[#fbfbfa] px-4 py-2 text-[13px] font-semibold shadow-[0_2px_10px_rgba(23,24,26,0.18)] hover:border-[#a06d00] " +
            (localizacao.ativa
              ? "border-[#0a6b3c] text-[#0a6b3c]"
              : "border-[#dcdedb] text-[#191a1c]")
          }
          aria-pressed={localizacao.ativa}
          onClick={localizacao.alternar}
        >
          {localizacao.ativa && (
            <span className={pontoVivoMapa} aria-hidden="true" />
          )}
          {localizacao.ativa ? "rastreando você" : "onde estou"}
        </button>
        {localizacao.estado.erro !== null && (
          <p
            role="status"
            className="m-0 max-w-[230px] rounded-[10px] border border-[#dcdedb] bg-[#fbfbfa] px-3 py-2 text-xs text-[#bf3b2b] shadow-[0_2px_10px_rgba(23,24,26,0.12)]"
          >
            {localizacao.estado.erro}
          </p>
        )}
      </div>

      <p className="absolute bottom-0 right-0 m-0 bg-white/70 px-1 text-[10px] text-[#66696f]">
        ©{" "}
        <a
          className="underline"
          href="https://www.openstreetmap.org/copyright"
          target="_blank"
          rel="noreferrer"
        >
          OpenStreetMap
        </a>{" "}
        · z{quadro.zoom}
      </p>
    </div>
  );
}

function pontoParaQuadro(ponto: readonly [number, number]): Ponto {
  return { lat: ponto[0], lng: ponto[1] };
}
