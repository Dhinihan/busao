import type {
  Linha,
  PosicaoVeiculo,
  PosicoesDaLinha,
  PontoRota,
  PrevisaoChegada,
  PrevisaoLinha,
  PrevisaoParada,
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

function paraPrevisoesChegada(bruto: unknown): PrevisaoChegada[] {
  if (!Array.isArray(bruto)) return [];
  const previsoes: PrevisaoChegada[] = [];
  for (const item of bruto) {
    if (typeof item !== "object" || item === null) continue;
    const prefixo = campoDe(item, "p");
    const horario = campoDe(item, "t");
    if (!ehTexto(prefixo) || !ehTexto(horario)) continue;
    previsoes.push({
      prefixo,
      horario,
      acessivel: campoDe(item, "a") === true,
    });
  }
  return previsoes;
}

function paraPrevisaoLinha(bruto: unknown): PrevisaoLinha | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const cl = campoDe(bruto, "cl");
  if (!ehNumero(cl)) return null;
  const letreiro = campoDe(bruto, "c");
  if (!ehTexto(letreiro)) return null;
  const lt0 = campoDe(bruto, "lt0");
  const lt1 = campoDe(bruto, "lt1");
  // Na previsão, lt0 é o letreiro de destino da linha (doc Olho Vivo).
  const destino = [lt0, lt1].filter(ehTexto).find((t) => t !== "") ?? "";
  return {
    cl,
    letreiro,
    destino,
    previsoes: paraPrevisoesChegada(campoDe(bruto, "vs")),
  };
}

// Resposta crua de /Previsao/Parada da API Olho Vivo:
// { hr, p: { cp, np, py, px, l: [...] } }
export function paraPrevisaoParada(bruto: unknown): PrevisaoParada | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  const parada = campoDe(bruto, "p");
  if (typeof parada !== "object" || parada === null) return null;
  const linhasBrutas = campoDe(parada, "l");
  if (!Array.isArray(linhasBrutas)) return null;
  const horarioBruto = campoDe(bruto, "hr");
  const latBruto = campoDe(parada, "py");
  const lngBruto = campoDe(parada, "px");
  const linhas: PrevisaoLinha[] = [];
  for (const item of linhasBrutas) {
    const linha = paraPrevisaoLinha(item);
    if (linha !== null) linhas.push(linha);
  }
  return {
    horario: ehTexto(horarioBruto) ? horarioBruto : "",
    nome: ehTexto(campoDe(parada, "np")) ? (campoDe(parada, "np") as string) : "",
    lat: ehNumero(latBruto) ? latBruto : null,
    lng: ehNumero(lngBruto) ? lngBruto : null,
    linhas,
  };
}

// Forma serializada pelo nosso servidor (camelCase) — espelha paraPosicoesDoCliente.
export function paraPrevisaoDoCliente(bruto: unknown): PrevisaoParada | null {
  if (typeof bruto !== "object" || bruto === null) return null;
  if (!("horario" in bruto) || typeof bruto.horario !== "string") return null;
  if (!("linhas" in bruto) || !Array.isArray(bruto.linhas)) return null;
  const nome = "nome" in bruto && typeof bruto.nome === "string" ? bruto.nome : "";
  const lat =
    "lat" in bruto && typeof bruto.lat === "number" && Number.isFinite(bruto.lat)
      ? bruto.lat
      : null;
  const lng =
    "lng" in bruto && typeof bruto.lng === "number" && Number.isFinite(bruto.lng)
      ? bruto.lng
      : null;
  const linhas: PrevisaoLinha[] = [];
  for (const item of bruto.linhas) {
    if (typeof item !== "object" || item === null) continue;
    const cl = "cl" in item ? item.cl : undefined;
    const letreiro = "letreiro" in item ? item.letreiro : undefined;
    if (typeof cl !== "number" || typeof letreiro !== "string") continue;
    const destino =
      "destino" in item && typeof item.destino === "string" ? item.destino : "";
    const previsoes: PrevisaoChegada[] = [];
    if ("previsoes" in item && Array.isArray(item.previsoes)) {
      for (const chegada of item.previsoes) {
        if (typeof chegada !== "object" || chegada === null) continue;
        const prefixo = "prefixo" in chegada ? chegada.prefixo : undefined;
        const horario = "horario" in chegada ? chegada.horario : undefined;
        if (typeof prefixo !== "string" || typeof horario !== "string") continue;
        previsoes.push({
          prefixo,
          horario,
          acessivel:
            "acessivel" in chegada && chegada.acessivel === true,
        });
      }
    }
    linhas.push({ cl, letreiro, destino, previsoes });
  }
  return { horario: bruto.horario, nome, lat, lng, linhas };
}
