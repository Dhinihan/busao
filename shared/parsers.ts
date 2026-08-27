import type {
  Linha,
  PosicaoVeiculo,
  PosicoesDaLinha,
  PontoRota,
  RotaDaLinha,
  Sentido,
  StatusApi,
} from "./tipos.ts";

function campoDe(objeto: object, chave: string): unknown {
  if (!(chave in objeto)) return undefined;
  return Reflect.get(objeto, chave);
}

function ehTexto(valor: unknown): valor is string {
  return typeof valor === "string";
}

function ehNumero(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isFinite(valor);
}

function ehPontoRota(valor: unknown): valor is PontoRota {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "lat" in valor &&
    ehNumero(valor.lat) &&
    "lng" in valor &&
    ehNumero(valor.lng)
  );
}

export function ehStatus(valor: unknown): valor is StatusApi {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "configurado" in valor &&
    typeof valor.configurado === "boolean"
  );
}

export function ehLinha(valor: unknown): valor is Linha {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "id" in valor &&
    typeof valor.id === "number" &&
    "letreiro" in valor &&
    typeof valor.letreiro === "string" &&
    "descricao" in valor &&
    typeof valor.descricao === "string"
  );
}

export function paraLinha(bruto: unknown): Linha | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const id = campoDe(bruto, "cl");
  const parte1 = campoDe(bruto, "lt");
  const parte2 = campoDe(bruto, "tl");
  const primario = campoDe(bruto, "tp");
  const secundario = campoDe(bruto, "ts");
  if (!ehNumero(id) || !ehTexto(parte1)) return null;
  const sufixo = ehNumero(parte2)
    ? String(parte2)
    : ehTexto(parte2)
      ? parte2
      : "";
  // sl=1 rumo ao terminal primário (ida), sl=2 rumo ao secundário (volta).
  const sentido: Sentido | undefined =
    campoDe(bruto, "sl") === 1 ? "ida" : campoDe(bruto, "sl") === 2 ? "volta" : undefined;
  const rumoAoSecundario = sentido === "volta";
  const destino = (
    rumoAoSecundario ? [secundario, primario] : [primario, secundario]
  )
    .filter(ehTexto)
    .find((t) => t !== "");
  return {
    id,
    letreiro: sufixo === "" ? parte1 : `${parte1}-${sufixo}`,
    descricao: destino ?? "",
    sentido,
  };
}

export function paraPosicoes(bruto: unknown): PosicoesDaLinha | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const horarioBruto = campoDe(bruto, "hr");
  const veiculosBrutos = campoDe(bruto, "vs");
  if (!Array.isArray(veiculosBrutos)) return null;
  const veiculos: PosicaoVeiculo[] = [];
  for (const item of veiculosBrutos) {
    if (typeof item !== "object" || item === null) continue;
    const prefixo = campoDe(item, "p");
    const lat = campoDe(item, "py");
    const lng = campoDe(item, "px");
    if (!ehTexto(prefixo) || !ehNumero(lat) || !ehNumero(lng)) continue;
    veiculos.push({
      prefixo,
      lat,
      lng,
      acessivel: campoDe(item, "a") === true,
    });
  }
  return { horario: ehTexto(horarioBruto) ? horarioBruto : "", veiculos };
}

function pontosGeoJson(bruto: unknown): PontoRota[] {
  if (!Array.isArray(bruto)) return [];
  const pontos: PontoRota[] = [];
  for (const coordenada of bruto) {
    if (!Array.isArray(coordenada)) continue;
    const lng = coordenada[0];
    const lat = coordenada[1];
    if (!ehNumero(lat) || !ehNumero(lng)) continue;
    pontos.push({ lat, lng });
  }
  return pontos;
}

function trechosGeoJson(bruto: unknown): PontoRota[][] {
  if (typeof bruto !== "object" || bruto === null) return [];
  const tipo = campoDe(bruto, "type");
  const coordenadas = campoDe(bruto, "coordinates");
  if (tipo === "LineString") {
    const pontos = pontosGeoJson(coordenadas);
    return pontos.length >= 2 ? [pontos] : [];
  }
  if (tipo !== "MultiLineString" || !Array.isArray(coordenadas)) return [];
  const trechos: PontoRota[][] = [];
  for (const coordenadasTrecho of coordenadas) {
    const pontos = pontosGeoJson(coordenadasTrecho);
    if (pontos.length >= 2) trechos.push(pontos);
  }
  return trechos;
}

export function paraRotaGeoSampa(bruto: unknown): RotaDaLinha | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const features = campoDe(bruto, "features");
  if (!Array.isArray(features)) return null;
  const trechos: PontoRota[][] = [];
  for (const feature of features) {
    if (typeof feature !== "object" || feature === null) continue;
    trechos.push(...trechosGeoJson(campoDe(feature, "geometry")));
  }
  return trechos.length === 0 ? null : { trechos };
}

export function paraPosicoesDoCliente(bruto: unknown): PosicoesDaLinha | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  if (!("horario" in bruto) || typeof bruto.horario !== "string") return null;
  if (!("veiculos" in bruto) || !Array.isArray(bruto.veiculos)) return null;
  const veiculos: PosicaoVeiculo[] = [];
  for (const item of bruto.veiculos) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("prefixo" in item) ||
      typeof item.prefixo !== "string" ||
      !("lat" in item) ||
      typeof item.lat !== "number" ||
      !("lng" in item) ||
      typeof item.lng !== "number" ||
      !("acessivel" in item) ||
      typeof item.acessivel !== "boolean"
    ) {
      continue;
    }
    veiculos.push({
      prefixo: item.prefixo,
      lat: item.lat,
      lng: item.lng,
      acessivel: item.acessivel,
    });
  }
  return { horario: bruto.horario, veiculos };
}

export function paraRotaDoCliente(bruto: unknown): RotaDaLinha | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  if (!("trechos" in bruto) || !Array.isArray(bruto.trechos)) return null;
  const trechos: PontoRota[][] = [];
  for (const trecho of bruto.trechos) {
    if (!Array.isArray(trecho)) continue;
    const pontos = trecho.filter(ehPontoRota);
    if (pontos.length >= 2) trechos.push(pontos);
  }
  return { trechos };
}
