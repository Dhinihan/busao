export type LinhaEstado = {
  readonly id: unknown;
  readonly valor: unknown;
};

export type DbEstado = {
  estado: {
    withIndex(
      nome: "por_chave",
      alcance: (q: any) => any,
    ): {
      first(): Promise<any>;
    };
    insert(linha: { chave: string; valor: string }): Promise<any>;
    update(id: unknown, parcial: { valor?: string }): Promise<unknown>;
  };
};

export type ResultadoEscrita = "criada" | "atualizada" | "igual" | "ignorada";

export type Escrita = {
  readonly resultado: ResultadoEscrita;
  readonly vigente: string | null;
};

const JANELA_PADRAO_MS = 120_000;

type Envelope = { valor: string; gravadoEm: number };

function envelopar(valor: string, gravadoEm: number): string {
  return JSON.stringify({ valor, gravadoEm });
}

function desembrulhar(cru: string): Envelope | null {
  try {
    const candidato: unknown = JSON.parse(cru);
    if (
      typeof candidato === "object" &&
      candidato !== null &&
      "valor" in candidato &&
      "gravadoEm" in candidato &&
      typeof candidato.valor === "string" &&
      typeof candidato.gravadoEm === "number"
    ) {
      return { valor: candidato.valor, gravadoEm: candidato.gravadoEm };
    }
  } catch {
    return null;
  }
  return null;
}

function valorLegivel(cru: unknown): string {
  if (typeof cru !== "string") return "";
  const envelope = desembrulhar(cru);
  return envelope === null ? cru : envelope.valor;
}

export function criarEstadoDb(
  db: DbEstado | null,
  opcoes: {
    readonly agora?: () => number;
    readonly janelaMs?: number;
  } = {},
): {
  ler(chave: string): Promise<LinhaEstado | null>;
  gravar(chave: string, valor: string): Promise<Escrita>;
} {
  const agora = opcoes.agora ?? Date.now;
  const janelaMs = opcoes.janelaMs ?? JANELA_PADRAO_MS;
  return {
    async ler(chave: string): Promise<LinhaEstado | null> {
      if (db === null) return null;
      const linha = await db.estado
        .withIndex("por_chave", (q) => q.eq("chave", chave))
        .first();
      if (linha === null || linha === undefined) return null;
      return { id: linha.id, valor: valorLegivel(linha.valor) };
    },
    async gravar(chave: string, valor: string): Promise<Escrita> {
      if (db === null) return { resultado: "ignorada", vigente: null };
      const existente = await db.estado
        .withIndex("por_chave", (q) => q.eq("chave", chave))
        .first();
      const instante = agora();
      if (existente === null || existente === undefined) {
        await db.estado.insert({
          chave,
          valor: envelopar(valor, instante),
        });
        return { resultado: "criada", vigente: valor };
      }
      const cru =
        typeof existente.valor === "string" ? existente.valor : "";
      const envelope = cru === "" ? null : desembrulhar(cru);
      const valorAtual = envelope === null ? cru : envelope.valor;
      if (valorAtual === valor) {
        return { resultado: "igual", vigente: valor };
      }
      const gravadoEm = envelope?.gravadoEm ?? 0;
      if (instante - gravadoEm < janelaMs) {
        return { resultado: "ignorada", vigente: valorAtual };
      }
      await db.estado.update(existente.id, {
        valor: envelopar(valor, instante),
      });
      return { resultado: "atualizada", vigente: valor };
    },
  };
}
