import { useEffect, useRef, useState } from "preact/hooks";
import {
  TILE_SIZE,
  deslocarMundo,
  enquadrarPontos,
  mundoEmPixel,
  pixelEmMundo,
  pontoParaPixelDeTela,
  tilesVisiveis,
  type Pixel,
  type Ponto,
} from "../shared/tile-math";
import { useLocalizacao, type EstadoPosicoes } from "./hooks";
import type { Linha } from "../shared/tipos.ts";

const ZOOM_MINIMO = 0;
const ZOOM_MAXIMO = 18;

const pontoVivoMapa =
  "h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#0a6b3c] motion-reduce:animate-none";

export function Mapa(props: {
  linhas: readonly Linha[];
  posicoes: Readonly<Record<number, EstadoPosicoes>>;
}) {
  const { linhas, posicoes } = props;
  const variasLinhas = linhas.length > 1;

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
  const ponteirosRef = useRef<Map<number, Pixel>>(new Map());
  const gestoRef = useRef<{
    distanciaInicial: number;
    zoomInicial: number;
    ancora: Ponto;
  } | null>(null);
  const enquadrouAte = useRef<Set<number>>(new Set());
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
    if (linhas.length === 0) {
      enquadrouAte.current.clear();
      return;
    }
    if (tamanho.largura === 0) return;
    // Enquadra só a linha mais recente que chegou com ônibus; as demais
    // continuam visíveis onde estiverem.
    for (let i = linhas.length - 1; i >= 0; i--) {
      const id = linhas[i]?.id;
      if (id === undefined || enquadrouAte.current.has(id)) continue;
      const veiculos = posicoes[id]?.dados?.veiculos;
      if (veiculos === undefined || veiculos.length === 0) continue;
      enquadrouAte.current.add(id);
      setQuadro(
        enquadrarPontos(veiculos, {
          largura: tamanho.largura,
          altura: tamanho.altura,
        }),
      );
      break;
    }
  }, [linhas, posicoes, tamanho.largura, tamanho.altura]);

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

  function posicaoLocal(evento: PointerEvent): Pixel {
    const retangulo = (
      evento.currentTarget as HTMLElement
    ).getBoundingClientRect();
    return {
      x: evento.clientX - retangulo.left,
      y: evento.clientY - retangulo.top,
    };
  }

  function aoPressionar(evento: PointerEvent) {
    const alvo = evento.target as HTMLElement | null;
    if (alvo !== null && alvo.closest("button, a") !== null) return;
    evento.preventDefault();
    (evento.currentTarget as HTMLElement).setPointerCapture(evento.pointerId);
    ponteirosRef.current.set(evento.pointerId, posicaoLocal(evento));
    const ativos = [...ponteirosRef.current.values()];
    if (ativos.length === 2) {
      arrasteRef.current = null;
      const [a, b] = ativos;
      const meio = meioEntre(a, b);
      gestoRef.current = {
        distanciaInicial: Math.hypot(a.x - b.x, a.y - b.y),
        zoomInicial: quadro.zoom,
        ancora: deslocarMundo(
          quadro,
          meio.x - tamanho.largura / 2,
          meio.y - tamanho.altura / 2,
          quadro.zoom,
        ),
      };
      return;
    }
    if (ativos.length === 1) {
      arrasteRef.current = {
        x: evento.clientX,
        y: evento.clientY,
        centro: quadro,
      };
    }
  }

  function aoArrastar(evento: PointerEvent) {
    if (!ponteirosRef.current.has(evento.pointerId)) return;
    const local = posicaoLocal(evento);
    ponteirosRef.current.set(evento.pointerId, local);
    const ativos = [...ponteirosRef.current.values()];
    if (ativos.length >= 2) {
      const gesto = gestoRef.current;
      if (gesto === null || tamanho.largura === 0) return;
      const [a, b] = ativos;
      const distancia = Math.hypot(a.x - b.x, a.y - b.y);
      if (distancia <= 0) return;
      const zoom = limitarZoom(
        gesto.zoomInicial + Math.log2(distancia / gesto.distanciaInicial),
      );
      const meio = meioEntre(a, b);
      const ancoraPixel = mundoEmPixel(gesto.ancora, zoom);
      const centroPixel = {
        x: ancoraPixel.x - (meio.x - tamanho.largura / 2),
        y: ancoraPixel.y - (meio.y - tamanho.altura / 2),
      };
      setQuadro({ ...pixelEmMundo(centroPixel, zoom), zoom });
      return;
    }
    const arraste = arrasteRef.current;
    if (arraste === null) return;
    const dx = local.x - arraste.x;
    const dy = local.y - arraste.y;
    const novo = deslocarMundo(arraste.centro, -dx, -dy, quadro.zoom);
    setQuadro({ ...novo, zoom: quadro.zoom });
  }

  function aoSoltar(evento: PointerEvent) {
    ponteirosRef.current.delete(evento.pointerId);
    const restantes = [...ponteirosRef.current.values()];
    if (restantes.length < 2 && gestoRef.current !== null) {
      gestoRef.current = null;
      setQuadro((atual) => ({ ...atual, zoom: Math.round(atual.zoom) }));
    }
    const unico = restantes[0];
    arrasteRef.current =
      unico === undefined ? null : { x: unico.x, y: unico.y, centro: quadro };
  }

  function alternarZoom(delta: number) {
    setQuadro((atual) => ({
      ...atual,
      zoom: limitarZoom(atual.zoom + delta),
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
            width: `${TILE_SIZE * tile.escala}px`,
            height: `${TILE_SIZE * tile.escala}px`,
            filter: "grayscale(1) contrast(1.05) brightness(1.02)",
          }}
        />
      ))}

      {linhas.map((linha) => {
        const veiculos = posicoes[linha.id]?.dados?.veiculos ?? [];
        return veiculos.map((veiculo) => {
          const tela = pontoParaPixelDeTela(veiculo, {
            centro: quadro,
            zoom: quadro.zoom,
            largura: tamanho.largura,
            altura: tamanho.altura,
          });
          return (
            <div
              key={`${linha.id}-${veiculo.prefixo}`}
              className="group absolute"
              style={{ left: `${tela.x}px`, top: `${tela.y}px` }}
              title={
                linha.letreiro +
                " · " +
                veiculo.prefixo +
                (veiculo.acessivel ? " · acessível" : "")
              }
            >
              {variasLinhas && (
                <span className="pointer-events-none absolute bottom-[23px] left-0 -translate-x-1/2 whitespace-nowrap rounded-md bg-neutral-900 px-1 py-px font-mono text-[10px] font-bold leading-tight text-amber-300">
                  {linha.letreiro}
                </span>
              )}
              <div className="h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-neutral-900 bg-amber-400" />
              <div className="pointer-events-none absolute left-3 top-[-8px] hidden whitespace-nowrap rounded-md border border-[#dcdedb] bg-[#fbfbfa] px-1.5 py-0.5 font-mono text-xs text-[#191a1c] shadow-[0_2px_8px_rgba(23,24,26,0.15)] group-hover:block">
                {linha.letreiro} · {veiculo.prefixo}
                {veiculo.acessivel ? " · acessível" : ""}
              </div>
            </div>
          );
        });
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

function meioEntre(a: Pixel, b: Pixel): Pixel {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function limitarZoom(zoom: number): number {
  return Math.min(ZOOM_MAXIMO, Math.max(ZOOM_MINIMO, zoom));
}
