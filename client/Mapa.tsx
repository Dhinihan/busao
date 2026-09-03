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
import { paradasNoQuadro } from "../shared/paradas";
import type { Parada } from "../shared/paradas";
import {
  useLocalizacao,
  type EstadoPosicoes,
  type EstadoRota,
} from "./hooks";
import { useParadas } from "./paradas";
import { corDoLetreiro } from "../shared/regioes.ts";
import type { Linha } from "../shared/tipos.ts";

const ZOOM_MINIMO = 0;
const ZOOM_MAXIMO = 18;
const ZOOM_PARADAS = 15;
const MARGEM_QUADRO_PX = 48;
const MAX_PARADAS_TELA = 1500;

const pontoVivoMapa =
  "h-2 w-2 shrink-0 animate-pulse rounded-full bg-[#0a6b3c] motion-reduce:animate-none";

const CORES_ROTAS = ["#1d4ed8", "#7c3aed", "#0f766e", "#b45309"] satisfies
  readonly string[];

export function Mapa(props: {
  linhas: readonly Linha[];
  posicoes: Readonly<Record<number, EstadoPosicoes>>;
  rotas: Readonly<Record<number, EstadoRota>>;
  expandido: boolean;
  aoAlternarExpansao: () => void;
  paradaSelecionada: Parada | null;
  aoSelecionarParada: (parada: Parada) => void;
}) {
  const {
    linhas,
    posicoes,
    rotas,
    expandido,
    aoAlternarExpansao,
    paradaSelecionada,
    aoSelecionarParada,
  } = props;
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
  const marcacoesRef = useRef<HTMLDivElement | null>(null);
  const localizacao = useLocalizacao();

  // Reinicia as animações da camada sem desmontar marcadores: a chave é
  // derivada de atualizadoEm (não do ciclo de vida do elemento), e o
  // replay por reflow preserva hover/title entre ciclos de polling.
  const chaveCiclos = linhas
    .map((l) => `${l.id}:${posicoes[l.id]?.atualizadoEm?.getTime() ?? 0}`)
    .join("|");
  useEffect(() => {
    const raiz = marcacoesRef.current;
    if (raiz === null) return;
    const animados = raiz.querySelectorAll(
      ".camada-onibus, .marcador-onibus, .disco-onibus",
    );
    if (animados.length === 0) return;
    for (const el of animados) {
      if (el instanceof HTMLElement) el.style.animation = "none";
    }
    void raiz.offsetWidth;
    for (const el of animados) {
      if (el instanceof HTMLElement) el.style.animation = "";
    }
  }, [chaveCiclos]);

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
    const elemento = containerRef.current;
    if (elemento === null) return;
    const largura = elemento.clientWidth;
    const altura = elemento.clientHeight;
    setTamanho((atual) =>
      atual.largura === largura && atual.altura === altura
        ? atual
        : { largura, altura },
    );
  }, [expandido]);

  useEffect(() => {
    if (linhas.length === 0) {
      enquadrouAte.current.clear();
      return;
    }
    if (tamanho.largura === 0) return;
    // Enquadra só a linha mais recente que chegou com trajeto ou ônibus; as
    // demais continuam visíveis onde estiverem.
    for (let i = linhas.length - 1; i >= 0; i--) {
      const id = linhas[i]?.id;
      if (id === undefined || enquadrouAte.current.has(id)) continue;
      const estadoRota = rotas[id];
      if (estadoRota === undefined) continue;
      const pontosRota = estadoRota.dados?.trechos.flat() ?? [];
      const veiculos = posicoes[id]?.dados?.veiculos;
      const pontos = pontosRota.length > 0 ? pontosRota : (veiculos ?? []);
      if (pontos.length === 0) continue;
      enquadrouAte.current.add(id);
      setQuadro(
        enquadrarPontos(pontos, {
          largura: tamanho.largura,
          altura: tamanho.altura,
        }),
      );
      break;
    }
  }, [linhas, posicoes, rotas, tamanho.largura, tamanho.altura]);

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
      if (a === undefined || b === undefined) return;
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
      if (a === undefined || b === undefined) return;
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

  const paradas = useParadas(quadro.zoom >= ZOOM_PARADAS);
  const raioPonto = quadro.zoom >= 17 ? 10 : 8;
  const paradasVisiveis = (() => {
    if (
      paradas.paradas === null ||
      quadro.zoom < ZOOM_PARADAS ||
      tamanho.largura <= 0 ||
      tamanho.altura <= 0
    ) {
      return null;
    }
    const centroPixel = mundoEmPixel(quadro, quadro.zoom);
    const cantoA = pixelEmMundo(
      {
        x: centroPixel.x - tamanho.largura / 2 - MARGEM_QUADRO_PX,
        y: centroPixel.y - tamanho.altura / 2 - MARGEM_QUADRO_PX,
      },
      quadro.zoom,
    );
    const cantoB = pixelEmMundo(
      {
        x: centroPixel.x + tamanho.largura / 2 + MARGEM_QUADRO_PX,
        y: centroPixel.y + tamanho.altura / 2 + MARGEM_QUADRO_PX,
      },
      quadro.zoom,
    );
    const noQuadro = paradasNoQuadro(paradas.paradas, {
      latMin: Math.min(cantoA.lat, cantoB.lat),
      latMax: Math.max(cantoA.lat, cantoB.lat),
      lngMin: Math.min(cantoA.lng, cantoB.lng),
      lngMax: Math.max(cantoA.lng, cantoB.lng),
    });
    return noQuadro.length <= MAX_PARADAS_TELA ? noQuadro : null;
  })();

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

      {tamanho.largura > 0 && tamanho.altura > 0 && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
          preserveAspectRatio="none"
          viewBox={`0 0 ${tamanho.largura} ${tamanho.altura}`}
        >
          {linhas.map((linha, indice) => {
            const trechos = rotas[linha.id]?.dados?.trechos ?? [];
            const cor =
              CORES_ROTAS[indice % CORES_ROTAS.length] ?? "#1d4ed8";
            return trechos.map((trecho, trechoIndice) => {
              if (trecho.length < 2) return null;
              const pontosNaTela = trecho.map((ponto) =>
                pontoParaPixelDeTela(ponto, {
                  centro: quadro,
                  zoom: quadro.zoom,
                  largura: tamanho.largura,
                  altura: tamanho.altura,
                }),
              );
              const pontosSvg = pontosNaTela
                .map((ponto) => `${ponto.x},${ponto.y}`)
                .join(" ");
              return (
                <g key={`rota-${linha.id}-${trechoIndice}`}>
                  <polyline
                    fill="none"
                    points={pontosSvg}
                    stroke="#fbfbfa"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="8"
                    opacity="0.9"
                  />
                  <polyline
                    fill="none"
                    points={pontosSvg}
                    stroke={cor}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="4"
                    opacity="0.85"
                  />
                </g>
              );
            });
          })}
        </svg>
      )}

      <div ref={marcacoesRef} className="pointer-events-none absolute inset-0">
        {linhas.map((linha) => {
          const cor = corDoLetreiro(linha.letreiro);
          const estadoLinha = posicoes[linha.id];
          const veiculos = estadoLinha?.dados?.veiculos ?? [];
          if (veiculos.length === 0) return null;
          return (
            <div key={linha.id} className="camada-onibus absolute inset-0">
              {veiculos.map((veiculo) => {
                const tela = pontoParaPixelDeTela(veiculo, {
                  centro: quadro,
                  zoom: quadro.zoom,
                  largura: tamanho.largura,
                  altura: tamanho.altura,
                });
                return (
                  <div
                    key={`${linha.id}-${veiculo.prefixo}`}
                    className="group marcador-onibus pointer-events-auto absolute"
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
                    <div
                      className={
                        "disco-onibus h-[14px] w-[14px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-neutral-900" +
                        (cor === null ? " bg-amber-400" : "")
                      }
                      style={cor === null ? undefined : { backgroundColor: cor }}
                    />
                    <div className="pointer-events-none absolute left-3 top-[-8px] hidden whitespace-nowrap rounded-md border border-[#dcdedb] bg-[#fbfbfa] px-1.5 py-0.5 font-mono text-xs text-[#191a1c] shadow-[0_2px_8px_rgba(23,24,26,0.15)] group-hover:block">
                    {linha.letreiro} · {veiculo.prefixo}
                    {veiculo.acessivel ? " · acessível" : ""}
                  </div>
                </div>
              );
              })}
            </div>
          );
        })}
      </div>

      {paradasVisiveis !== null && (
        <div className="pointer-events-none absolute inset-0">
          {paradasVisiveis.map((parada, indice) => {
            const tela = pontoParaPixelDeTela(parada, {
              centro: quadro,
              zoom: quadro.zoom,
              largura: tamanho.largura,
              altura: tamanho.altura,
            });
            const selecionada = parada === paradaSelecionada;
            return (
              <button
                key={`${parada.lat},${parada.lng},${indice}`}
                type="button"
                className="parada-mapa group pointer-events-auto absolute m-0 flex h-[30px] w-[30px] cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0"
                style={{ left: `${tela.x - 15}px`, top: `${tela.y - 15}px` }}
                title={
                  parada.letreiros.length > 0
                    ? `linhas ${parada.letreiros.join(", ")}`
                    : "ponto de ônibus"
                }
                aria-label={
                  parada.letreiros.length > 0
                    ? `Ponto de ônibus, linhas ${parada.letreiros.join(", ")}`
                    : "Ponto de ônibus"
                }
                aria-pressed={selecionada}
                onClick={() => aoSelecionarParada(parada)}
              >
                <span
                  aria-hidden="true"
                  className={
                    "block rounded-full border-white shadow-[0_1px_4px_rgba(23,24,26,0.5)] transition-transform " +
                    (selecionada
                      ? "h-[13px] w-[13px] border-2 border-[#ffb300] bg-[#ffb300]"
                      : raioPonto === 10
                        ? "h-[10px] w-[10px] border-[1.5px] bg-[#565d68] group-hover:scale-125"
                        : "h-[8px] w-[8px] border-[1.5px] bg-[#565d68] group-hover:scale-125")
                  }
                />
              </button>
            );
          })}
        </div>
      )}

      {paradas.erro !== null && (
        <p
          role="status"
          className="pill-ciclo absolute bottom-9 left-1/2 z-10 m-0 max-w-[86%] -translate-x-1/2 whitespace-nowrap rounded-full bg-neutral-900/95 px-4 py-1.5 text-center font-mono text-xs text-amber-300 shadow-[0_6px_24px_rgba(23,24,26,0.35)]"
        >
          {paradas.erro}
        </p>
      )}

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
        <button
          type="button"
          className={
            "flex h-8 w-8 items-center justify-center rounded-lg border bg-white p-0 text-[#191a1c] shadow-[0_2px_10px_rgba(23,24,26,0.12)] hover:bg-[#eceeea] " +
            (expandido ? "border-[#a06d00]" : "border-[#dcdedb]")
          }
          aria-pressed={expandido}
          aria-label={expandido ? "Recolher mapa" : "Expandir mapa"}
          title={expandido ? "Recolher mapa (Esc)" : "Expandir mapa"}
          onClick={aoAlternarExpansao}
        >
          {expandido ? (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
            </svg>
          ) : (
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              aria-hidden="true"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
          )}
        </button>
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
