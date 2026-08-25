// Pipeline offline: GTFS (zip oficial) -> carga.sql para o D1.
// Uso:
//   node gtfs/pipeline.ts                       # usa mapa existente
//   node gtfs/pipeline.ts --atualizar-mapa      # consulta Olho Vivo p/ mapear cls
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
  extrairCores,
  extrairRotas,
  prefixoLetreiro,
} from "../shared/gtfs.ts";
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

async function consultarLinhas(
  token: string,
  letreiros: readonly string[],
): Promise<Map<string, readonly EntradaMapa[]>> {
  let cookie: string | null = null;

  async function entrar(): Promise<void> {
    const resposta = await fetch(
      `${API_BASE}/Login/Autenticar?token=${encodeURIComponent(token)}`,
      { method: "POST", headers: { "content-length": "0" } },
    );
    if (!(await resposta.text()).includes("true")) {
      throw new Error("login na SPTrans recusou o token");
    }
    const cabecalhos = resposta.headers as Headers & { getSetCookie?: () => string[] };
    const brutos = typeof cabecalhos.getSetCookie === "function"
      ? cabecalhos.getSetCookie()
      : [cabecalhos.get("set-cookie") ?? ""];
    cookie = brutos[0]?.split(";")[0] ?? null;
    if (!cookie) throw new Error("autenticação não devolveu cookie");
  }

  const mapa = new Map<string, EntradaMapa[]>();

  async function buscarUm(letreiro: string): Promise<void> {
    for (let tentativa = 0; tentativa < 2; tentativa += 1) {
      try {
        if (!cookie) await entrar();
      } catch {
        throw new Error("não foi possível autenticar na SPTrans");
      }
      let resposta: Response;
      try {
        resposta = await fetch(
          `${API_BASE}/Linha/Buscar?termosBusca=${encodeURIComponent(letreiro)}`,
          { headers: { cookie: cookie! } },
        );
      } catch {
        continue;
      }
      if (!resposta.ok) {
        cookie = null;
        continue;
      }
      const corpo = (await resposta.json()) as unknown;
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
      return;
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
