// Quadro de horários programados da SPTrans (GTFS processado).
// GET /horarios?cl=346 -> { cl, feed_em, origem, tipo_dia: {util, sab, dom} }

export interface Env {
  readonly busao_horarios: D1Database;
}

type LinhaHorarios = {
  readonly cl: number;
  readonly tipo_dia: string;
  readonly origem: string;
  readonly partidas: string;
  readonly feed_em: string;
};

type RespostaHorarios = {
  readonly cl: number;
  readonly feed_em: string;
  readonly origem: string;
  readonly tipo_dia: Record<string, readonly string[]>;
};

const CORS = {
  "access-control-allow-origin": "*",
  "content-type": "application/json; charset=utf-8",
};

function resposta(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: CORS });
}

function ehClValido(valor: string | null): valor is string {
  return valor !== null && /^\d{1,10}$/.test(valor);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname !== "/horarios") {
      return resposta({ erro: "rota inexistente — use GET /horarios?cl=<codigo>" }, 404);
    }
    const clBruto = url.searchParams.get("cl");
    if (!ehClValido(clBruto)) {
      return resposta({ erro: "parâmetro cl ausente ou inválido" }, 400);
    }

    const resultado = await env.busao_horarios
      .prepare(
        "SELECT cl, tipo_dia, origem, partidas, feed_em FROM horarios WHERE cl = ? ORDER BY tipo_dia",
      )
      .bind(Number(clBruto))
      .all<LinhaHorarios>();
    const resultados = resultado.results ?? [];

    if (resultados.length === 0) {
      return resposta(
        { erro: "sem quadro de horários para esta linha" },
        404,
      );
    }

    const tipoDia: Record<string, readonly string[]> = {};
    let feedEm = "";
    let origem = "";
    for (const linha of resultados) {
      let partidas: unknown;
      try {
        partidas = JSON.parse(linha.partidas);
      } catch {
        continue;
      }
      if (!Array.isArray(partidas)) continue;
      tipoDia[linha.tipo_dia] = partidas as readonly string[];
      feedEm = linha.feed_em;
      origem = linha.origem;
    }
    const corpo: RespostaHorarios = {
      cl: Number(clBruto),
      feed_em: feedEm,
      origem,
      tipo_dia: tipoDia,
    };
    return resposta(corpo);
  },
} satisfies ExportedHandler<Env>;
