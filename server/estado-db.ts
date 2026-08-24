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

export function criarEstadoDb(db: DbEstado | null): {
  ler(chave: string): Promise<LinhaEstado | null>;
  gravar(chave: string, valor: string): Promise<ResultadoEscrita>;
} {
  return {
    async ler(chave: string): Promise<LinhaEstado | null> {
      if (db === null) return null;
      return db.estado
        .withIndex("por_chave", (q) => q.eq("chave", chave))
        .first();
    },
    async gravar(chave: string, valor: string): Promise<ResultadoEscrita> {
      if (db === null) return "ignorada";
      const existente = await db.estado
        .withIndex("por_chave", (q) => q.eq("chave", chave))
        .first();
      if (existente === null || existente === undefined) {
        await db.estado.insert({ chave, valor });
        return "criada";
      }
      if (existente.valor === valor) return "igual";
      await db.estado.update(existente.id, { valor });
      return "atualizada";
    },
  };
}
