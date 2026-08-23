import { useEffect, useRef, useState } from "preact/hooks";
import {
  deslocarMundo,
  enquadrarPontos,
  pontoParaPixelDeTela,
  tilesVisiveis,
  type Ponto,
} from "../shared/tile-math";

type Onibus = {
  readonly prefixo: string;
  readonly lat: number;
  readonly lng: number;
};

type LinhaFake = {
  readonly id: number;
  readonly letreiro: string;
  readonly base: Ponto;
};

const LINHAS: readonly LinhaFake[] = [
  { id: 1001, letreiro: "8000-10", base: { lat: -23.5505, lng: -46.6333 } },
  { id: 1002, letreiro: "702U-10", base: { lat: -23.5614, lng: -46.6559 } },
  { id: 1003, letreiro: "477P-10", base: { lat: -23.5453, lng: -46.6244 } },
];

const FROTA_POR_LINHA = 5;

function onibusDaLinha(linha: LinhaFake, tempo: number): Onibus[] {
  const veiculos: Onibus[] = [];
  for (let i = 0; i < FROTA_POR_LINHA; i += 1) {
    const fase = ((tempo / 40 + i / FROTA_POR_LINHA) % 2 + 2) % 2;
    const progresso = fase < 1 ? fase : 2 - fase;
    const oscilacao = Math.sin(tempo / 4 + i * 1.7) * 0.002;
    veiculos.push({
      prefixo: `${12000 + linha.id * 10 + i}`,
      lat:
        linha.base.lat - 0.02 + progresso * 0.04 + oscilacao,
      lng: linha.base.lng - 0.02 + progresso * 0.04,
    });
  }
  return veiculos;
}

function useLocalizacao() {
  const [ponto, setPonto] = useState<Ponto | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ativa, setAtiva] = useState(false);

  useEffect(() => {
    if (!ativa) return;
    if (!("geolocation" in navigator)) {
      setErro("seu navegador não tem localização");
      setAtiva(false);
      return;
    }
    const id = navigator.geolocation.watchPosition(
      (posicao) =>
        setPonto({
          lat: posicao.coords.latitude,
          lng: posicao.coords.longitude,
        }),
      (falha) => {
        setPonto(null);
        setErro(
          falha.code === falha.PERMISSION_DENIED
            ? "permissão de localização negada"
            : "localização indisponível agora",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [ativa]);

  return { ponto, erro, ativa, alternar: () => setAtiva((v) => !v) };
}

const ZOOM_MINIMO = 0;
const ZOOM_MAXIMO = 18;

export function App() {
  const [linhaId, setLinhaId] = useState<number | null>(null);
  const [tempo, setTempo] = useState(0);
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
  const localizacao = useLocalizacao();

  const linhaAtiva = LINHAS.find((l) => l.id === linhaId) ?? null;
  const onibus = linhaAtiva === null ? [] : onibusDaLinha(linhaAtiva, tempo);

  useEffect(() => {
    const timer = window.setInterval(() => setTempo((t) => t + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

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
    if (linhaAtiva === null || tamanho.largura === 0) return;
    if (enquadrouAte.current === linhaAtiva.id) return;
    const amostra = onibusDaLinha(linhaAtiva, tempo);
    enquadrouAte.current = linhaAtiva.id;
    setQuadro(
      enquadrarPontos(amostra, {
        largura: tamanho.largura,
        altura: tamanho.altura,
      }),
    );
  }, [linhaAtiva, tamanho.largura, tamanho.altura]);

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
    <main className="flex h-screen flex-col bg-neutral-950 text-neutral-100">
      <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-2">
        <span className="font-mono text-sm font-bold">busão·sp</span>
        <span className="ml-auto flex gap-1 overflow-x-auto">
          {LINHAS.map((linha) => (
            <button
              key={linha.id}
              type="button"
              className={
                "shrink-0 rounded px-2 py-1 font-mono text-xs " +
                (linha.id === linhaId
                  ? "bg-amber-400 text-black"
                  : "border border-neutral-700 text-neutral-300")
              }
              onClick={() => {
                enquadrouAte.current = null;
                setLinhaId(linha.id);
              }}
            >
              {linha.letreiro}
            </button>
          ))}
          {linhaId !== null && (
            <button
              type="button"
              className="shrink-0 border border-neutral-700 px-2 py-1 text-xs"
              onClick={() => {
                enquadrouAte.current = null;
                setLinhaId(null);
              }}
            >
              ×
            </button>
          )}
        </span>
      </header>

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

        {onibus.map((veiculo) => {
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
                title={veiculo.prefixo}
              />
              <div className="pointer-events-none absolute left-3 top-[-8px] hidden whitespace-nowrap rounded bg-black/85 px-1.5 py-0.5 font-mono text-[10px] group-hover:block">
                {veiculo.prefixo}
              </div>
            </div>
          );
        })}

        {localizacao.ponto !== null &&
          (() => {
            const tela = pontoParaPixelDeTela(localizacao.ponto, {
              centro: quadro,
              zoom: quadro.zoom,
              largura: tamanho.largura,
              altura: tamanho.altura,
            });
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
          {localizacao.erro !== null && (
            <p className="max-w-[180px] rounded bg-black/85 px-2 py-1 text-[11px] text-red-300">
              {localizacao.erro}
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
    </main>
  );
}
