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
