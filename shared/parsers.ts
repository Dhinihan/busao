import type {
  Linha,
  PosicaoVeiculo,
  PosicoesDaLinha,
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

export function ehStatus(valor: unknown): valor is StatusApi {
  return (
    typeof valor === "object" &&
    valor !== null &&
    "configurado" in valor &&
    typeof valor.configurado === "boolean" &&
    "demo" in valor &&
    typeof valor.demo === "boolean" &&
    "validado" in valor &&
    typeof valor.validado === "boolean"
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
  const rumoAoSecundario = campoDe(bruto, "sl") === 2;
  const destino = (
    rumoAoSecundario ? [secundario, primario] : [primario, secundario]
  )
    .filter(ehTexto)
    .find((t) => t !== "");
  return {
    id,
    letreiro: sufixo === "" ? parte1 : `${parte1}-${sufixo}`,
    descricao: destino ?? "",
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
