// Lógica pura do GTFS da SPTrans: CSV, janelas de frequência e extração
// das partidas de origem por linha·sentido·tipo-de-dia. Sem I/O — o
// pipeline (gtfs/pipeline.ts) cuida dos arquivos.

export type TipoDia = "util" | "sab" | "dom";

export const TIPOS_DIA: readonly TipoDia[] = ["util", "sab", "dom"];

export type Registro = { readonly [campo: string]: string };

export type JanelaDeFrequencia = {
  readonly inicio: string;
  readonly fim: string;
  readonly intervaloSegundos: number;
};

export type FontesGtfs = {
  readonly rotas: readonly Registro[];
  readonly viagens: readonly Registro[];
  readonly tempos: readonly Registro[];
  readonly frequencias: readonly Registro[];
  readonly calendar: readonly Registro[];
  readonly paradas: readonly Registro[];
};

export type SentidoDaRota = {
  readonly directionId: number;
  readonly origem: string;
  readonly partidas: Readonly<Record<TipoDia, readonly string[]>>;
};

export type RotaExtraida = {
  readonly routeId: string;
  readonly sentidos: readonly SentidoDaRota[];
};

// CSV com aspas, vírgula e quebra de linha dentro do campo (stops.txt usa).
export function csvParaRegistros(texto: string): readonly Registro[] {
  const linhas: string[][] = [];
  let campo = "";
  let linha: string[] = [];
  let emAspas = false;
  for (let i = 0; i < texto.length; i += 1) {
    const caractere = texto[i];
    if (emAspas) {
      if (caractere === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i += 1;
        } else {
          emAspas = false;
        }
      } else {
        campo += caractere;
      }
    } else if (caractere === '"') {
      emAspas = true;
    } else if (caractere === ",") {
      linha.push(campo);
      campo = "";
    } else if (caractere === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else if (caractere !== "\r") {
      campo += caractere;
    }
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  const cabecalho = linhas[0];
  if (cabecalho === undefined) return [];
  return linhas.slice(1)
    .filter((partes) => partes.length === cabecalho.length)
    .map((partes) => Object.fromEntries(
      cabecalho.map((nome, i) => [nome.trim(), partes[i] ?? ""]),
    ));
}

function minutosDoDia(horario: string): number | null {
  const partes = horario.split(":");
  const horas = Number(partes[0]);
  const minutos = Number(partes[1]);
  if (!Number.isInteger(horas) || !Number.isInteger(minutos)) return null;
  return horas * 60 + minutos;
}

function paraHHMM(minutosAbsolutos: number): string {
  const horas = Math.floor(minutosAbsolutos / 60);
  const minutos = minutosAbsolutos % 60;
  return `${String(horas).padStart(2, "0")}:${String(minutos).padStart(2, "0")}`;
}

const LIMITE_PARTIDAS_POR_JANELA = 600;

export function expandirJanela(janela: JanelaDeFrequencia): readonly string[] {
  const inicio = minutosDoDia(janela.inicio);
  const fim = minutosDoDia(janela.fim);
  if (
    inicio === null || fim === null ||
    !Number.isFinite(janela.intervaloSegundos) ||
    janela.intervaloSegundos <= 0 || fim < inicio
  ) {
    return [];
  }
  const passo = janela.intervaloSegundos / 60;
  const partidas: string[] = [];
  for (let minuto = inicio; minuto < fim && partidas.length < LIMITE_PARTIDAS_POR_JANELA; minuto += passo) {
    partidas.push(paraHHMM(Math.round(minuto)));
  }
  return partidas;
}

// Convenção adotada: "util" exige os cinco dias úteis ativos no serviço.
export function tiposDiaDoServico(servico: Registro): readonly TipoDia[] {
  const tipos: TipoDia[] = [];
  const diaAtivo = (coluna: string): boolean => servico[coluna] === "1";
  const uteis = ["monday", "tuesday", "wednesday", "thursday", "friday"];
  if (uteis.every((coluna) => diaAtivo(coluna))) tipos.push("util");
  if (diaAtivo("saturday")) tipos.push("sab");
  if (diaAtivo("sunday")) tipos.push("dom");
  return tipos;
}

function agruparPorTrip(
  registros: readonly Registro[],
): Map<string, Registro[]> {
  const grupos = new Map<string, Registro[]>();
  for (const registro of registros) {
    const tripId = registro.trip_id;
    if (tripId === undefined) continue;
    const lista = grupos.get(tripId);
    if (lista !== undefined) lista.push(registro);
    else grupos.set(tripId, [registro]);
  }
  return grupos;
}

type AcumuladorSentido = {
  origem: string | null;
  partidas: Record<TipoDia, Set<string>>;
};

export function extrairRotas(fontes: FontesGtfs): readonly RotaExtraida[] {
  const nomeParada = new Map(fontes.paradas.map((p) => [p.stop_id, p.stop_name]));
  const temposPorTrip = agruparPorTrip(fontes.tempos);
  for (const lista of temposPorTrip.values()) {
    lista.sort((a, b) => Number(a.stop_sequence) - Number(b.stop_sequence));
  }
  const frequenciasPorTrip = agruparPorTrip(fontes.frequencias);

  const tiposPorServico = new Map<string, readonly TipoDia[]>();
  for (const servico of fontes.calendar) {
    if (servico.service_id === undefined) continue;
    tiposPorServico.set(servico.service_id, tiposDiaDoServico(servico));
  }

  const viagensPorRotaDirecao = new Map<string, Registro[]>();
  for (const viagem of fontes.viagens) {
    const chave = `${viagem.route_id}\u0000${viagem.direction_id}`;
    const lista = viagensPorRotaDirecao.get(chave);
    if (lista !== undefined) lista.push(viagem);
    else viagensPorRotaDirecao.set(chave, [viagem]);
  }

  const rotasPorId = new Map<string, RotaExtraida>();
  for (const [chave, viagens] of viagensPorRotaDirecao) {
    const [routeId, direcaoBruta] = chave.split("\u0000");
    if (routeId === undefined || direcaoBruta === undefined) continue;

    const acumulador: AcumuladorSentido = {
      origem: null,
      partidas: { util: new Set(), sab: new Set(), dom: new Set() },
    };
    for (const viagem of viagens) {
      const servicoId = viagem.service_id;
      if (servicoId === undefined) continue;
      const tipos = tiposPorServico.get(servicoId);
      if (tipos === undefined || tipos.length === 0) continue;

      const primeiraParada = temposPorTrip.get(viagem.trip_id ?? "")?.[0];
      if (primeiraParada === undefined) continue;
      const partidaExata = primeiraParada.departure_time;
      if (partidaExata === undefined) continue;
      const origem = nomeParada.get(primeiraParada.stop_id ?? "");
      if (origem !== undefined && acumulador.origem === null) {
        acumulador.origem = origem;
      }

      const janelas = frequenciasPorTrip.get(viagem.trip_id ?? "");
      let partidasDoServico: Iterable<string>;
      if (janelas !== undefined) {
        const expandidas: string[] = [];
        for (const janela of janelas) {
          expandidas.push(...expandirJanela({
            inicio: janela.start_time ?? "",
            fim: janela.end_time ?? "",
            intervaloSegundos: Number(janela.headway_secs),
          }));
        }
        partidasDoServico = expandidas;
      } else {
        partidasDoServico = [partidaExata.slice(0, 5)];
      }
      for (const tipo of tipos) {
        for (const partida of partidasDoServico) acumulador.partidas[tipo].add(partida);
      }
    }
    if (acumulador.origem === null) continue;

    const sentidos: SentidoDaRota = {
      directionId: Number(direcaoBruta),
      origem: acumulador.origem,
      partidas: {
        util: [...acumulador.partidas.util].sort(),
        sab: [...acumulador.partidas.sab].sort(),
        dom: [...acumulador.partidas.dom].sort(),
      },
    };
    const existente = rotasPorId.get(routeId);
    if (existente !== undefined) {
      rotasPorId.set(routeId, { ...existente, sentidos: [...existente.sentidos, sentidos] });
    } else {
      rotasPorId.set(routeId, { routeId, sentidos: [sentidos] });
    }
  }
  return [...rotasPorId.values()]
    .map((rota) => ({
      ...rota,
      sentidos: [...rota.sentidos].sort((a, b) => a.directionId - b.directionId),
    }))
    .sort((a, b) => a.routeId.localeCompare(b.routeId));
}

export function prefixoLetreiro(routeId: string): string {
  const corte = routeId.lastIndexOf("-");
  return corte > 0 ? routeId.slice(0, corte) : routeId;
}

// Cor oficial da linha (route_color de routes.txt) por letreiro sem sufixo.
// A primeira variante do feed vence e cor ausente/malformada é descartada.
export function extrairCores(
  rotas: readonly Registro[],
): Readonly<Record<string, string>> {
  const cores: Record<string, string> = {};
  for (const rota of rotas) {
    const cor = rota.route_color ?? "";
    if (!/^[0-9A-Fa-f]{6}$/.test(cor)) continue;
    const letreiro = prefixoLetreiro(rota.route_id ?? "");
    if (letreiro === "" || cores[letreiro] !== undefined) continue;
    cores[letreiro] = `#${cor}`;
  }
  return cores;
}

export type ParadaOlhoVivo = {
  readonly cp: number;
  readonly nome: string;
  readonly lat: number;
  readonly lng: number;
};

const RAIO_TERRA_M = 6_371_000;

// Equiretangular local — erro desprezível para limiares de bairros.
export function distanciaMetros(
  a: { readonly lat: number; readonly lng: number },
  b: { readonly lat: number; readonly lng: number },
): number {
  const radiano = Math.PI / 180;
  const y = (b.lat - a.lat) * radiano;
  const x = (b.lng - a.lng) * radiano * Math.cos(((a.lat + b.lat) / 2) * radiano);
  return Math.sqrt(x * x + y * y) * RAIO_TERRA_M;
}

// Casamento offline stop_id (GTFS) → cp (Olho Vivo): os IDs não coincidem
// entre os sistemas. Para cada parada do Olho Vivo, casa com a parada GTFS
// mais próxima; com letreiros não vazio, a parada GTFS precisa carregar um
// dos letreiros da linha consultada. Ganancioso por distância crescente,
// cada lado no máximo um par. Grade espacial evita comparar tudo contra tudo.
export function casarParadas(opcoes: {
  readonly paradasGtfs: ReadonlyMap<
    string,
    { readonly lat: number; readonly lng: number; readonly letreiros: ReadonlySet<string> }
  >;
  readonly paradasOlhoVivo: readonly ParadaOlhoVivo[];
  readonly letreiros: ReadonlySet<string>;
  readonly limiteMetros?: number;
}): readonly (readonly [string, number])[] {
  const limite = opcoes.limiteMetros ?? 80;
  // Célula derivada do limiar: a vizinhança 3×3 cobre no mínimo 1 célula em
  // cada eixo a partir do ponto consultado. Premissa: latitudes de São Paulo
  // (1° de lng ≈ 102 km; usando 100 km/° a cobertura fica ≥ o limiar nos
  // dois eixos).
  const CELULA_GRAU = limite / 100_000;
  const celula = (lat: number, lng: number): string =>
    `${Math.floor(lat / CELULA_GRAU)},${Math.floor(lng / CELULA_GRAU)}`;
  const grade = new Map<string, string[]>();
  for (const [stopId, parada] of opcoes.paradasGtfs) {
    const chave = celula(parada.lat, parada.lng);
    const lista = grade.get(chave);
    if (lista === undefined) grade.set(chave, [stopId]);
    else lista.push(stopId);
  }

  const candidatos: {
    readonly stopId: string;
    readonly cp: number;
    readonly metros: number;
  }[] = [];
  for (const ov of opcoes.paradasOlhoVivo) {
    const gx = Math.floor(ov.lat / CELULA_GRAU);
    const gy = Math.floor(ov.lng / CELULA_GRAU);
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        const lista = grade.get(`${gx + dx},${gy + dy}`);
        if (lista === undefined) continue;
        for (const stopId of lista) {
          const parada = opcoes.paradasGtfs.get(stopId);
          if (parada === undefined) continue;
          const semRestricao = opcoes.letreiros.size === 0;
          let temLetreiro = semRestricao;
          for (const letreiro of parada.letreiros) {
            if (opcoes.letreiros.has(letreiro)) {
              temLetreiro = true;
              break;
            }
          }
          if (!temLetreiro) continue;
          const metros = distanciaMetros(ov, parada);
          if (metros <= limite) {
            candidatos.push({ stopId, cp: ov.cp, metros });
          }
        }
      }
    }
  }
  candidatos.sort((a, b) => a.metros - b.metros);
  const casadosGtfs = new Set<string>();
  const casadosCp = new Set<number>();
  const pares: (readonly [string, number])[] = [];
  for (const candidato of candidatos) {
    if (casadosGtfs.has(candidato.stopId) || casadosCp.has(candidato.cp)) continue;
    casadosGtfs.add(candidato.stopId);
    casadosCp.add(candidato.cp);
    pares.push([candidato.stopId, candidato.cp]);
  }
  return pares;
}
