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
      className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-neutral-900"
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
            <div className="pointer-events-none absolute left-3 top-[-8px] hidden whitespace-nowrap rounded bg-black/85 px-1.5 py-0.5 font-mono text-[10px] group-hover:block">
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

      <div className="absolute bottom-2 left-2 flex flex-col gap-2">
        <div className="flex flex-col overflow-hidden rounded border border-neutral-700">
          <button
            type="button"
            className="h-8 w-8 bg-black/80 text-lg leading-none"
            onClick={() => alternarZoom(1)}
          >
            +
          </button>
          <button
            type="button"
            className="h-8 w-8 bg-black/80 text-lg leading-none"
            onClick={() => alternarZoom(-1)}
          >
            −
          </button>
        </div>
        <button
          type="button"
          className={
            "rounded px-2 py-1 text-xs " +
            (localizacao.ativa
              ? "bg-blue-600 text-white"
              : "border border-neutral-700 bg-black/80 text-neutral-200")
          }
          onClick={localizacao.alternar}
        >
          {localizacao.ativa ? "rastreando você" : "onde estou"}
        </button>
        {localizacao.estado.erro !== null && (
          <p
            role="status"
            className="max-w-[180px] rounded bg-black/85 px-2 py-1 text-[11px] text-red-300"
          >
            {localizacao.estado.erro}
          </p>
        )}
      </div>

      <p className="absolute bottom-0 right-0 bg-black/70 px-1 text-[9px] text-neutral-400">
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
