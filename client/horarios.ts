// Cliente do serviço de quadro de horários (Cloudflare Workers) + helpers
// puros de data. Sem JSX para caber no typecheck testável.

export type TipoDia = "util" | "sab" | "dom";

export type QuadroHorarios = {
  readonly cl: number;
  readonly feed_em: string;
  readonly origem: string;
  readonly tipo_dia: Readonly<Partial<Record<TipoDia, readonly string[]>>>;
};

export class ErroQuadroAusente extends Error {
  constructor() {
    super("SPTrans não publica quadro para esta linha");
  }
}

const SERVICO_HORARIOS =
  "https://busao-horarios.vinicius-nas-silva.workers.dev";

export async function apiHorarios(cl: number): Promise<QuadroHorarios> {
  const resposta = await fetch(`${SERVICO_HORARIOS}/horarios?cl=${cl}`);
  if (resposta.status === 404) throw new ErroQuadroAusente();
  if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
  const corpo: unknown = await resposta.json();
  if (
    typeof corpo !== "object" ||
    corpo === null ||
    !("origem" in corpo) ||
    typeof (corpo as QuadroHorarios).origem !== "string" ||
    !("tipo_dia" in corpo) ||
    typeof (corpo as QuadroHorarios).tipo_dia !== "object"
  ) {
    throw new Error("resposta de horários inválida");
  }
  return corpo as QuadroHorarios;
}

export function tipoDiaDe(data: Date): TipoDia {
  const dia = data.getDay();
  return dia === 0 ? "dom" : dia === 6 ? "sab" : "util";
}

export function minutosDaPartida(partida: string): number | null {
  const partes = partida.split(":");
  const horas = Number(partes[0]);
  const minutos = Number(partes[1]);
  if (
    partes.length !== 2 ||
    !Number.isInteger(horas) ||
    !Number.isInteger(minutos) ||
    horas < 0 ||
    horas > 23 ||
    minutos < 0 ||
    minutos > 59
  ) {
    return null;
  }
  return horas * 60 + minutos;
}

export function proximasPartidas(
  partidas: readonly string[],
  agoraMin: number,
): readonly string[] {
  return [...partidas]
    .flatMap((partida) => {
      const minutos = minutosDaPartida(partida);
      return minutos === null || minutos < agoraMin ? [] : [{ partida, minutos }];
    })
    .sort((a, b) => a.minutos - b.minutos)
    .map((par) => par.partida);
}

export function minutosAte(partida: string, agoraMin: number): number | null {
  const minutos = minutosDaPartida(partida);
  return minutos === null ? null : minutos - agoraMin;
}
