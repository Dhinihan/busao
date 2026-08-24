import assert from "node:assert/strict";
import { test } from "node:test";
import { criarEstadoDb, type DbEstado } from "../server/estado-db.ts";

type Linha = { chave: string; valor: string; id: number };

function criarDbFalso() {
  const linhas = new Map<number, Linha>();
  let proximoId = 1;
  const contagem = { inserts: 0, updates: 0, leituras: 0 };
  const db: DbEstado = {
    estado: {
      withIndex(_nome: string, alcance: (q: any) => any) {
        return {
          async first() {
            contagem.leituras += 1;
            const chave = alcance({
              eq: (_campo: string, valor: string) => valor,
            });
            for (const linha of linhas.values()) {
              if (linha.chave === chave) return linha;
            }
            return null;
          },
        };
      },
      async insert(linha: { chave: string; valor: string }) {
        contagem.inserts += 1;
        const id = proximoId;
        proximoId += 1;
        linhas.set(id, { ...linha, id });
        return { id };
      },
      async update(id: unknown, parcial: { valor?: string }) {
        contagem.updates += 1;
        const linha = linhas.get(id as number);
        if (linha === undefined) throw new Error("linha inexistente");
        if (parcial.valor !== undefined) linha.valor = parcial.valor;
        return id;
      },
    },
  };
  return { db, linhas, contagem };
}

test("grava cria linha quando chave não existe", async () => {
  const { db, linhas } = criarDbFalso();
  const estado = criarEstadoDb(db);
  const resultado = await estado.gravar("sessao", '{"cookie":"a"}');
  assert.equal(resultado, "criada");
  assert.equal(linhas.size, 1);
  assert.equal(linhas.get(1)?.valor, '{"cookie":"a"}');
});

test("grava atualiza quando valor difere", async () => {
  const { db, linhas } = criarDbFalso();
  const estado = criarEstadoDb(db);
  await estado.gravar("sessao", "primeiro");
  const resultado = await estado.gravar("sessao", "segundo");
  assert.equal(resultado, "atualizada");
  assert.equal(linhas.size, 1);
  assert.equal(linhas.get(1)?.valor, "segundo");
});

test("grava não escreve nada quando valor é igual", async () => {
  const { db, contagem } = criarDbFalso();
  const estado = criarEstadoDb(db);
  await estado.gravar("sessao", "mesmo-valor");
  assert.deepEqual(contagem, { inserts: 1, updates: 0, leituras: 1 });
  const resultado = await estado.gravar("sessao", "mesmo-valor");
  assert.equal(resultado, "igual");
  assert.deepEqual(contagem, { inserts: 1, updates: 0, leituras: 2 });
});

test("ler devolve a linha existente e null quando ausente", async () => {
  const { db } = criarDbFalso();
  const estado = criarEstadoDb(db);
  assert.equal(await estado.ler("sessao"), null);
  await estado.gravar("sessao", "valor");
  const linha = await estado.ler("sessao");
  assert.equal(linha?.valor, "valor");
  assert.ok(linha?.id !== undefined);
});

test("sem banco, ler devolve null e gravar ignora", async () => {
  const estado = criarEstadoDb(null);
  assert.equal(await estado.ler("sessao"), null);
  assert.equal(await estado.gravar("sessao", "valor"), "ignorada");
});
