import assert from "node:assert/strict";
import { test } from "node:test";
import {
  criarEstadoDb,
  type DbEstado,
  type Escrita,
} from "../server/estado-db.ts";

type Linha = { chave: string; valor: string; id: number };

const JANELA = 120_000;

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

function criarEstadoComRelogio() {
  const { db, linhas, contagem } = criarDbFalso();
  let instante = 1_000_000;
  const estado = criarEstadoDb(db, {
    agora: () => instante,
    janelaMs: JANELA,
  });
  return {
    estado,
    linhas,
    contagem,
    avancar(ms: number) {
      instante += ms;
    },
  };
}

test("grava cria linha envelopada quando chave não existe", async () => {
  const { estado, linhas } = criarEstadoComRelogio();
  const escrito = await estado.gravar("sessao", "primeiro");
  assert.deepEqual(escrito, { resultado: "criada", vigente: "primeiro" });
  assert.equal(linhas.size, 1);
  assert.deepEqual(JSON.parse(linhas.get(1)?.valor ?? ""), {
    valor: "primeiro",
    gravadoEm: 1_000_000,
  });
});

test("grava ignora e devolve o canônico quando difere dentro da janela", async () => {
  const { estado, linhas, contagem } = criarEstadoComRelogio();
  await estado.gravar("sessao", "primeiro");
  const escrito = await estado.gravar("sessao", "segundo");
  assert.deepEqual(escrito, { resultado: "ignorada", vigente: "primeiro" });
  assert.equal(linhas.size, 1);
  assert.deepEqual(JSON.parse(linhas.get(1)?.valor ?? ""), {
    valor: "primeiro",
    gravadoEm: 1_000_000,
  });
  assert.equal(contagem.updates, 0);
});

test("grava atualiza exatamente na borda da janela (idade == janela)", async () => {
  const { estado, avancar } = criarEstadoComRelogio();
  await estado.gravar("sessao", "primeiro");
  avancar(JANELA);
  const escrito = await estado.gravar("sessao", "segundo");
  assert.deepEqual(escrito, { resultado: "atualizada", vigente: "segundo" });
});

test("grava ignora um instante antes da borda (idade == janela - 1)", async () => {
  const { estado, avancar } = criarEstadoComRelogio();
  await estado.gravar("sessao", "primeiro");
  avancar(JANELA - 1);
  const escrito = await estado.gravar("sessao", "segundo");
  assert.deepEqual(escrito, { resultado: "ignorada", vigente: "primeiro" });
});

test("grava atualiza bem após a janela", async () => {
  const { estado, avancar, linhas } = criarEstadoComRelogio();
  await estado.gravar("sessao", "primeiro");
  avancar(2 * JANELA);
  const escrito = await estado.gravar("sessao", "terceiro");
  assert.deepEqual(escrito, { resultado: "atualizada", vigente: "terceiro" });
  assert.deepEqual(JSON.parse(linhas.get(1)?.valor ?? "").valor, "terceiro");
});

test("grava não escreve nada quando valor é igual", async () => {
  const { estado, contagem } = criarEstadoComRelogio();
  await estado.gravar("sessao", "primeiro");
  assert.deepEqual(contagem, { inserts: 1, updates: 0, leituras: 1 });
  const escrito = await estado.gravar("sessao", "primeiro");
  assert.deepEqual(escrito, { resultado: "igual", vigente: "primeiro" });
  assert.deepEqual(contagem, { inserts: 1, updates: 0, leituras: 2 });
});

test("ler devolve o conteúdo desembrulhado e null quando ausente", async () => {
  const { estado } = criarEstadoComRelogio();
  assert.equal(await estado.ler("sessao"), null);
  await estado.gravar("sessao", "primeiro");
  const linha = await estado.ler("sessao");
  assert.equal(linha?.valor, "primeiro");
  assert.ok(linha?.id !== undefined);
});

test("legado sem envelope é lido cru e é elegível a sobrescrita imediata", async () => {
  const { estado, linhas, contagem } = criarEstadoComRelogio();
  linhas.set(7, { chave: "sessao", valor: '{"cookie":"a"}', id: 7 });
  const lida = await estado.ler("sessao");
  assert.equal(lida?.valor, '{"cookie":"a"}');
  const escrito = await estado.gravar("sessao", '{"cookie":"b"}');
  assert.deepEqual(escrito, {
    resultado: "atualizada",
    vigente: '{"cookie":"b"}',
  });
  assert.equal(contagem.updates, 1);
  assert.deepEqual(JSON.parse(linhas.get(7)?.valor ?? ""), {
    valor: '{"cookie":"b"}',
    gravadoEm: 1_000_000,
  });
});

test("legado com mesmo conteúdo não reescreve", async () => {
  const { estado, linhas, contagem } = criarEstadoComRelogio();
  const cru = JSON.stringify({ token: "t", cookie: "a" });
  linhas.set(7, { chave: "sessao", valor: cru, id: 7 });
  const escrito = await estado.gravar("sessao", cru);
  assert.deepEqual(escrito, { resultado: "igual", vigente: cru });
  assert.equal(contagem.updates, 0);
  assert.equal(linhas.get(7)?.valor, cru);
});

test("sem banco, ler devolve null e gravar devolve ignorado sem canônico", async () => {
  const estado = criarEstadoDb(null);
  assert.equal(await estado.ler("sessao"), null);
  const escrito: Escrita = await estado.gravar("sessao", "valor");
  assert.deepEqual(escrito, { resultado: "ignorada", vigente: null });
});
