import { latLngBounds } from "leaflet";
import { useEffect, useRef } from "react";
import {
  CircleMarker,
  MapContainer,
  TileLayer,
  Tooltip,
  useMap,
} from "react-leaflet";
import type { EstadoPosicoes } from "../hooks";
import { useLocalizacao } from "../hooks";
import type { Linha, PosicaoVeiculo } from "../types";

function paraPonto(v: PosicaoVeiculo): [number, number] {
  return [v.lat, v.lng];
}

function AjusteLimites(props: {
  chave: number;
  pontos: [number, number][];
}) {
  const { chave, pontos } = props;
  const mapa = useMap();
  const ajustadoAte = useRef<number | null>(null);

  useEffect(() => {
    if (pontos.length === 0 || ajustadoAte.current === chave) return;
    mapa.fitBounds(latLngBounds(pontos), {
      padding: [48, 48],
      maxZoom: 15,
      animate: false,
    });
    ajustadoAte.current = chave;
  }, [chave, pontos, mapa]);

  return null;
}

function IrAte(props: { ponto: readonly [number, number] | null }) {
  const mapa = useMap();
  const centralizado = useRef(false);
  const { ponto } = props;

  useEffect(() => {
    if (ponto === null) {
      centralizado.current = false;
      return;
    }
    if (centralizado.current) return;
    centralizado.current = true;
    mapa.setView([...ponto], Math.max(mapa.getZoom(), 16), { animate: true });
  }, [ponto, mapa]);

  return null;
}

export function Mapa(props: { linha: Linha | null; estado: EstadoPosicoes }) {
  const { linha, estado } = props;
  const veiculos = estado.dados?.veiculos ?? [];
  const pontos = veiculos.map(paraPonto);
  const localizacao = useLocalizacao();

  return (
    <section className="mapa" aria-label="Mapa com as posições dos ônibus">
      <MapContainer
        center={[-23.5505, -46.6333]}
        zoom={12}
        className="mapa__folha"
        preferCanvas
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {veiculos.map((v) => (
          <CircleMarker
            key={v.prefixo}
            center={[v.lat, v.lng]}
            radius={7}
            pathOptions={{
              color: "#17181a",
              weight: 2,
              fillColor: "#ffb300",
              fillOpacity: 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              {v.prefixo}
              {v.acessivel ? " · acessível" : ""}
            </Tooltip>
          </CircleMarker>
        ))}
        {localizacao.estado.ponto !== null && (
          <CircleMarker
            center={[...localizacao.estado.ponto]}
            radius={8}
            pathOptions={{
              color: "#fbfbfa",
              weight: 3,
              fillColor: "#1a73e8",
              fillOpacity: 1,
            }}
          >
            <Tooltip direction="top" offset={[0, -10]}>
              você está aqui
            </Tooltip>
          </CircleMarker>
        )}
        <IrAte ponto={localizacao.estado.ponto} />
        {linha !== null && <AjusteLimites chave={linha.id} pontos={pontos} />}
      </MapContainer>

      <div className="mapa__acoes">
        <button
          type="button"
          className={
            "botao-mapa" + (localizacao.ativa ? " botao-mapa--ativo" : "")
          }
          aria-pressed={localizacao.ativa}
          onClick={localizacao.alternar}
        >
          {localizacao.ativa ? (
            <>
              <span className="vivo" aria-hidden="true" /> rastreando você
            </>
          ) : (
            "onde estou"
          )}
        </button>
        {localizacao.estado.erro !== null && (
          <p className="mapa__aviso" role="status">
            {localizacao.estado.erro}
          </p>
        )}
      </div>

      {linha === null && (
        <div className="mapa__vazio">
          <div className="mapa__vazio-cartao">
            <span className="led led--grande">busão·sp</span>
            <p>
              Busque pelo número ou nome da linha para ver os ônibus em
              circulação agora.
            </p>
          </div>
        </div>
      )}
    </section>
  );
}
