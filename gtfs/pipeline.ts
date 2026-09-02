// Pipeline offline: GTFS (zip oficial) -> carga.sql para o D1 + asset de
// paradas para o cliente. Uso:
//   node gtfs/pipeline.ts                       # usa mapa existente
//   node gtfs/pipeline.ts --atualizar-mapa      # consulta Olho Vivo p/ mapear cls
//   node gtfs/pipeline.ts --mapear-paradas      # consulta Olho Vivo p/ casar cps
import { execSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import {
  csvParaRegistros,
  casarParadas,
  extrairCores,
  extrairRotas,
  prefixoLetreiro,
  type ParadaOlhoVivo,
  type Registro,
} from "../shared/gtfs.ts";
import { codificarParadas } from "../shared/paradas.ts";
import { gzipSync } from "node:zlib";
import type { RotaExtraida } from "../shared/gtfs.ts";

const raiz = new URL("..", import.meta.url).pathname;

function argumento(nome: string): string | undefined {
  const indice = process.argv.indexOf(`--${nome}`);
  return indice >= 0 ? process.argv[indice + 1] : undefined;
}

const caminhoZip = argumento("zip") ?? `${raiz}gtfs/cittamobi_gtfs.zip`;
const caminhoMapa = argumento("mapa") ?? `${raiz}gtfs/mapa-cl.json`;
const atualizarMapa = process.argv.includes("--atualizar-mapa");

type EntradaMapa = { readonly cl: number; readonly sl: number };
type MapaCl = {
  readonly feed_em: string;
  readonly linhas: Readonly<Record<string, readonly EntradaMapa[]>>;
};

function lerToken(): string | null {
  if (process.env.OLHOVIVO_TOKEN) return process.env.OLHOVIVO_TOKEN;
  try {
    const env = readFileSync(`${raiz}.env.lakebed.server`, "utf8");
    const linha = env.split("\n").find((l) => l.startsWith("OLHOVIVO_TOKEN="));
    return linha?.slice("OLHOVIVO_TOKEN=".length).trim().replace(/^["']|["']$/g, "") ?? null;
  } catch {
    return null;
  }
}

const API_BASE = "https://api.olhovivo.sptrans.com.br/v2.1";

// O login da SPTrans recusa o token em janelas intermitentes (o mesmo token
// entra minutos depois) — tenta com espera antes de desistir.
async function criarSessao(token: string): Promise<string> {
  for (let tentativa = 0; tentativa < 4; tentativa += 1) {
    if (tentativa > 0) {
      await new Promise((resolver) => setTimeout(resolver, 15_000));
    }
    const resposta = await fetch(
      `${API_BASE}/Login/Autenticar?token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "content-length": "0" } },
    );
    if (!(await resposta.text()).includes("true")) continue;
    const cabecalhos = resposta.headers as Headers & { getSetCookie?: () => string[] };
    const brutos = typeof cabecalhos.getSetCookie === "function"
      ? cabecalhos.getSetCookie()
      : [cabecalhos.get("set-cookie") ?? ""];
    const cookie = brutos[0]?.split(";")[0] ?? null;
    if (cookie) return cookie;
  }
  throw new Error("login na SPTrans recusou o token mesmo com novas tentativas");
}

type ClienteSessao = {
  readonly cookie: () => Promise<string>;
  readonly invalidar: () => void;
};

function criarSessaoReutilizavel(token: string): ClienteSessao {
  let atual: string | null = null;
  return {
    async cookie(): Promise<string> {
      if (atual !== null) return atual;
      atual = await criarSessao(token);
      return atual;
    },
    invalidar(): void {
      atual = null;
    },
  };
}

async function pedirJson(
  sessao: ClienteSessao,
  caminho: string,
): Promise<unknown> {
  for (let tentativa = 0; tentativa < 2; tentativa += 1) {
    let cookie: string;
    try {
      cookie = await sessao.cookie();
    } catch {
      throw new Error("não foi possível autenticar na SPTrans");
    }
    let resposta: Response;
    try {
      resposta = await fetch(`${API_BASE}${caminho}`, { headers: { cookie } });
    } catch {
      continue;
    }
    if (resposta.status === 401 || resposta.status === 403) {
      sessao.invalidar();
      continue;
    }
    if (!resposta.ok) {
      throw new Error(`a API da SPTrans respondeu HTTP ${resposta.status}`);
    }
    return (await resposta.json()) as unknown;
  }
  throw new Error("sessão expirou mesmo após nova autenticação");
}

async function consultarLinhas(
  token: string,
  letreiros: readonly string[],
): Promise<Map<string, readonly EntradaMapa[]>> {
  const sessao = criarSessaoReutilizavel(token);

  const mapa = new Map<string, EntradaMapa[]>();

  async function buscarUm(letreiro: string): Promise<void> {
    let corpo: unknown;
    try {
      corpo = await pedirJson(
        sessao,
        `/Linha/Buscar?termosBusca=${encodeURIComponent(letreiro)}`,
      );
    } catch {
      return;
    }
    if (!Array.isArray(corpo)) return;
    for (const item of corpo) {
      const registro = item as Record<string, unknown>;
      if (
        typeof registro.cl !== "number" ||
        typeof registro.lt !== "string" ||
        typeof registro.sl !== "number"
      ) {
        continue;
      }
      const sufixo = registro.tl === undefined ? "" : String(registro.tl);
      const rotaId = sufixo === "" ? registro.lt : `${registro.lt}-${sufixo}`;
      const lista = mapa.get(rotaId) ?? [];
      if (!lista.some((entrada) => entrada.cl === registro.cl)) {
        lista.push({ cl: registro.cl, sl: registro.sl });
        mapa.set(rotaId, lista);
      }
    }
  }

  let feitas = 0;
  const fila = [...letreiros];
  async function trabalhadora(): Promise<void> {
    while (fila.length > 0) {
      const letreiro = fila.shift();
      if (letreiro === undefined) return;
      await buscarUm(letreiro);
      feitas += 1;
      if (feitas % 100 === 0) console.log(`  olho vivo: ${feitas}/${letreiros.length} letreiros`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, trabalhadora));
  return mapa;
}

async function construirMapa(letreiros: readonly string[]): Promise<MapaCl> {
  const token = lerToken();
  if (!token) {
    console.error("Sem mapa de cls e sem OLHOVIVO_TOKEN — rode com --atualizar-mapa num ambiente com token.");
    process.exit(1);
  }
  const feedEm = statSync(caminhoZip).mtime.toISOString().slice(0, 10);
  console.log(`Consultando Olho Vivo para ${letreiros.length} letreiros…`);
  const consultado = await consultarLinhas(token, letreiros);
  return { feed_em: feedEm, linhas: Object.fromEntries(consultado) };
}

function emitirSql(
  rotas: readonly RotaExtraida[],
  mapa: MapaCl,
): string {
  const literalSql = (valor: string): string =>
    `'${valor.replaceAll("'", "''")}'`;
  const partes: string[] = ["DELETE FROM horarios;"];
  let inseridos = 0;
  const semMapeamento: string[] = [];
  for (const rota of rotas) {
    const entradas = mapa.linhas[rota.routeId];
    if (entradas === undefined || entradas.length === 0) {
      semMapeamento.push(rota.routeId);
      continue;
    }
    for (const entrada of entradas) {
      const esperado = entrada.sl === 1 ? 0 : 1;
      const sentido = rota.sentidos.find((s) => s.directionId === esperado);
      if (sentido === undefined) {
        semMapeamento.push(`${rota.routeId} (sl=${entrada.sl})`);
        continue;
      }
      const valores = Object.entries(sentido.partidas)
        .filter(([, lista]) => lista.length > 0)
        .map(([tipo, lista]) =>
          `(${entrada.cl},${literalSql(tipo)},${literalSql(sentido.origem)},${literalSql(JSON.stringify(lista))},${literalSql(mapa.feed_em)})`)
        .join(",");
      if (valores === "") continue;
      partes.push(
        `INSERT INTO horarios (cl,tipo_dia,origem,partidas,feed_em) VALUES ${valores};`,
      );
      inseridos += 1;
    }
  }
  console.log(`Linhas carregadas: ${inseridos} · sem mapeamento/sentido: ${semMapeamento.length}`);
  if (semMapeamento.length > 0 && semMapeamento.length <= 15) {
    console.log(semMapeamento.join(", "));
  }
  return partes.join("\n");
}

function emitirCoresTs(cores: Readonly<Record<string, string>>): string {
  const entradas = Object.entries(cores)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([letreiro, cor]) => `${JSON.stringify(letreiro)}:${JSON.stringify(cor)}`)
    .join(",");
  return [
    "// GERADO por gtfs/pipeline.ts a partir de routes.txt do GTFS — não editar à mão.",
    "export const CORES_POR_LETREIRO: Readonly<Record<string, string>> = {" +
      entradas +
      "};",
    "",
  ].join("\n");
}

type MapaParadas = { readonly feed_em: string; readonly cps: Readonly<Record<string, number>> };

function letreirosPorStopDasFontes(fontes: {
  readonly rotas: readonly Registro[];
  readonly viagens: readonly Registro[];
  readonly tempos: readonly Registro[];
  readonly paradas: readonly Registro[];
}): Map<string, Set<string>> {
  const letreiroPorRoute = new Map(
    fontes.rotas.map((r) => [r.route_id ?? "", prefixoLetreiro(r.route_id ?? "")]),
  );
  const rotaPorTrip = new Map(
    fontes.viagens.map((v) => [v.trip_id ?? "", v.route_id ?? ""]),
  );
  const porStop = new Map<string, Set<string>>();
  for (const tempo of fontes.tempos) {
    const letreiro = letreiroPorRoute.get(rotaPorTrip.get(tempo.trip_id ?? "") ?? "");
    if (letreiro === undefined || letreiro === "") continue;
    const stopId = tempo.stop_id ?? "";
    if (stopId === "") continue;
    const lista = porStop.get(stopId);
    if (lista === undefined) porStop.set(stopId, new Set([letreiro]));
    else lista.add(letreiro);
  }
  return porStop;
}

function emitirParadas(
  fontes: {
    readonly paradas: readonly Registro[];
    readonly viagens: readonly Registro[];
    readonly rotas: readonly Registro[];
    readonly tempos: readonly Registro[];
  },
  cps: Readonly<Record<string, number>>,
): string {
  const letreirosPorStop = letreirosPorStopDasFontes(fontes);
  const feedEm = statSync(caminhoZip).mtime.toISOString().slice(0, 10);
  const paradas = fontes.paradas
    .filter((p) => p.stop_lat !== undefined && p.stop_lon !== undefined)
    .map((p) => ({
      lat: Number(p.stop_lat),
      lng: Number(p.stop_lon),
      letreiros: [...(letreirosPorStop.get(p.stop_id ?? "") ?? [])],
      cp: cps[p.stop_id ?? ""] ?? null,
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
  const asset = codificarParadas(feedEm, paradas);
  const corpo = JSON.stringify(asset);
  const comprimido = gzipSync(Buffer.from(corpo), { level: 9 }).toString("base64");
  const comCp = paradas.filter((p) => p.cp !== null).length;
  console.log(
    `Paradas no asset: ${paradas.length} · com cp: ${comCp} · json ${(corpo.length / 1024).toFixed(0)} KB · gzip base64 ${(comprimido.length / 1024).toFixed(0)} KB`,
  );
  // Módulo TS (não JSON em client/: a capsule não serve estáticos) — mesmo
  // padrão de shared/cores.ts. Payload gzipado + base64 para caber no limite
  // de 1 MB do artifact; o cliente descomprime com DecompressionStream.
  return [
    "// GERADO por gtfs/pipeline.ts a partir do stops.txt do GTFS — não editar à mão.",
    "// String base64 de gzip(JSON do asset); decodifique com decodificarParadasGzip().",
    "",
    `export const ASSET_PARADAS_GZIP: string =`,
    `  "${comprimido}";`,
    "",
  ].join("\n");
}

// Casar stop_id (GTFS) com cp (Olho Vivo): varre BuscarParadasPorLinha por
// todos os cl do mapa-cl e aproxima por distância + letreiro. Um request por
// cl, uma vez a cada feed novo — o resultado vira gtfs/mapa-paradas.json.
async function mapearCps(
  token: string,
  fontes: {
    readonly paradas: readonly Registro[];
    readonly viagens: readonly Registro[];
    readonly rotas: readonly Registro[];
    readonly tempos: readonly Registro[];
  },
): Promise<MapaParadas> {
  const mapaCl = JSON.parse(readFileSync(caminhoMapa, "utf8")) as MapaCl;
  const letreiroPorRota = new Map<string, Set<string>>();
  const clPorLetreiros = new Map<number, Set<string>>();
  for (const [rotaId, entradas] of Object.entries(mapaCl.linhas)) {
    const letreiro = prefixoLetreiro(rotaId);
    if (letreiro === "") continue;
    for (const entrada of entradas) {
      const atual = clPorLetreiros.get(entrada.cl) ?? new Set<string>();
      atual.add(letreiro);
      clPorLetreiros.set(entrada.cl, atual);
      const rotasDoLetreiro = letreiroPorRota.get(letreiro) ?? new Set<string>();
      rotasDoLetreiro.add(rotaId);
      letreiroPorRota.set(letreiro, rotasDoLetreiro);
    }
  }
  const letreirosPorStop = letreirosPorStopDasFontes(fontes);
  const paradasGtfs = new Map(
    fontes.paradas
      .filter((p) => p.stop_lat !== undefined && p.stop_lon !== undefined)
      .map((p) => [
        p.stop_id ?? "",
        {
          lat: Number(p.stop_lat),
          lng: Number(p.stop_lon),
          letreiros: letreirosPorStop.get(p.stop_id ?? "") ?? new Set<string>(),
        },
      ]),
  );

  const cls = [...clPorLetreiros.keys()];
  console.log(`Casando cps: ${cls.length} cl + corredores…`);
  const sessao = criarSessaoReutilizavel(token);
  const cps = new Map<string, number>();

  // Fonte 1: paradas por linha (troncos de corredor). Fonte 2: todos os
  // corredores oficiais, sem restrição de letreiro — /Corredor cobre pontos
  // que nenhuma linha mapeada devolve (ex.: Parelheiros).
  const consultas: {
    readonly caminho: string;
    readonly letreiros: ReadonlySet<string>;
  }[] = cls.map((cl) => ({
    caminho: `/Parada/BuscarParadasPorLinha?codigoLinha=${cl}`,
    letreiros: clPorLetreiros.get(cl) ?? new Set<string>(),
  }));
  try {
    const corredores = await pedirJson(sessao, "/Corredor");
    if (Array.isArray(corredores)) {
      for (const corredor of corredores) {
        const cc = (corredor as Record<string, unknown>).cc;
        if (typeof cc !== "number") continue;
        consultas.push({
          caminho: `/Parada/BuscarParadasPorCorredor?codigoCorredor=${cc}`,
          letreiros: new Set<string>(),
        });
      }
    }
  } catch (erro) {
    console.log(`  corredores: ${erro instanceof Error ? erro.message : "erro"}`);
  }

  const fila = [...consultas];
  let feitas = 0;
  async function trabalhadora(): Promise<void> {
    while (fila.length > 0) {
      const consulta = fila.shift();
      if (consulta === undefined) return;
      let paradasLinha: ParadaOlhoVivo[] = [];
      try {
        const corpo = await pedirJson(sessao, consulta.caminho);
        if (Array.isArray(corpo)) {
          paradasLinha = corpo.flatMap((item) => {
            const registro = item as Record<string, unknown>;
            if (
              typeof registro.cp !== "number" ||
              typeof registro.np !== "string" ||
              typeof registro.py !== "number" ||
              typeof registro.px !== "number"
            ) {
              return [];
            }
            return [{ cp: registro.cp, nome: registro.np, lat: registro.py, lng: registro.px }];
          });
        }
      } catch (erro) {
        console.log(`  ${consulta.caminho}: ${erro instanceof Error ? erro.message : "erro"}`);
      }
      for (const [stopId, cp] of casarParadas({
        paradasGtfs,
        paradasOlhoVivo: paradasLinha,
        letreiros: consulta.letreiros,
      })) {
        cps.set(stopId, cp);
      }
      feitas += 1;
      if (feitas % 200 === 0) console.log(`  paradas: ${feitas}/${consultas.length} consultas · ${cps.size} cps`);
    }
  }
  await Promise.all(Array.from({ length: 4 }, trabalhadora));

  const feedEm = statSync(caminhoZip).mtime.toISOString().slice(0, 10);
  const mapa: MapaParadas = { feed_em: feedEm, cps: Object.fromEntries(cps) };
  writeFileSync(
    `${raiz}gtfs/mapa-paradas.json`,
    JSON.stringify(mapa),
  );
  console.log(`cps casados: ${cps.size} -> gtfs/mapa-paradas.json`);
  return mapa;
}

const tmp = "/tmp/busao-gtfs-carga";
rmSync(tmp, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
execSync(`unzip -oq "${caminhoZip}" -d "${tmp}"`);

const tabela = (nome: string) =>
  csvParaRegistros(readFileSync(`${tmp}/${nome}`, "utf8"));
const fontes = {
  rotas: tabela("routes.txt"),
  viagens: tabela("trips.txt"),
  tempos: tabela("stop_times.txt"),
  frequencias: tabela("frequencies.txt"),
  calendar: tabela("calendar.txt"),
  paradas: tabela("stops.txt"),
};

const rotas = extrairRotas(fontes);
console.log(`Rotas extraídas do GTFS: ${rotas.length}`);

const cores = extrairCores(fontes.rotas);
writeFileSync(`${raiz}shared/cores.ts`, emitirCoresTs(cores));
console.log(`Cores oficiais: ${Object.keys(cores).length} letreiros -> shared/cores.ts`);

const letreirosNecessarios = [...new Set(rotas.map((r) => prefixoLetreiro(r.routeId)))];

let mapa: MapaCl | null = null;
if (existsSync(caminhoMapa)) {
  mapa = JSON.parse(readFileSync(caminhoMapa, "utf8")) as MapaCl;
}
if (atualizarMapa || mapa === null) {
  mapa = await construirMapa(letreirosNecessarios);
  writeFileSync(caminhoMapa, JSON.stringify(mapa));
  console.log(`Mapa salvo em ${caminhoMapa}`);
}

writeFileSync(`${raiz}gtfs/carga.sql`, emitirSql(rotas, mapa));
console.log(`SQL gerado em gtfs/carga.sql`);

const mapearParadas = process.argv.includes("--mapear-paradas");
let cps: Readonly<Record<string, number>> = {};
const caminhoMapaParadas = `${raiz}gtfs/mapa-paradas.json`;
if (mapearParadas) {
  const token = lerToken();
  if (token === null) {
    console.error("--mapear-paradas precisa de OLHOVIVO_TOKEN (ou .env.lakebed.server).");
    process.exit(1);
  }
  const mapaParadas = await mapearCps(token, fontes);
  cps = mapaParadas.cps;
} else if (existsSync(caminhoMapaParadas)) {
  cps = (JSON.parse(readFileSync(caminhoMapaParadas, "utf8")) as MapaParadas).cps;
  console.log(`cps carregados de gtfs/mapa-paradas.json: ${Object.keys(cps).length}`);
}
writeFileSync(`${raiz}client/paradas-dados.ts`, emitirParadas(fontes, cps));
console.log(`Asset de paradas em client/paradas-dados.ts`);
