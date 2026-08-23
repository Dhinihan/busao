import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { criarCachePosicoes } from "../server/cache-posicoes.ts";
import type { PosicoesDaLinha } from "../shared/tipos.ts";

function posicoes(prefixo: string): PosicoesDaLinha {
  return {
    horario: "12:00",
    veiculos: [{ prefixo, lat: -23.55, lng: -46.63, acessivel: true }],
  };
}

let agoraMs: number;
let chamadas: number[];
let pendentes: {
  resolve: (dados: PosicoesDaLinha) => void;
  reject: (erro: unknown) => void;
}[] = [];

function criarCache(registros?: { resultado: string }[]) {
  return criarCachePosicoes({
    agora: () => agoraMs,
    buscar: async (linhaId: number) => {
      chamadas.push(linhaId);
      return new Promise<PosicoesDaLinha>((resolve, reject) => {
        pendentes.push({ resolve, reject });
      });
    },
    aoRegistrar: (linhaId, resultado) => {
      registros?.push({ resultado: `${linhaId}:${resultado}` });
    },
  });
}

function resolver(dados: PosicoesDaLinha): void {
  const pendente = pendentes.shift();
  if (pendente === undefined) throw new Error("nenhuma busca pendente");
  pendente.resolve(dados);
}

function rejeitar(erro: unknown): void {
  const pendente = pendentes.shift();
  if (pendente === undefined) throw new Error("nenhuma busca pendente");
  pendente.reject(erro);
}

beforeEach(() => {
  agoraMs = 1_000_000;
  chamadas = [];
  pendentes = [];
});

afterEach(() => {
  for (const pendente of pendentes.splice(0)) pendente.reject(new Error("teste encerrado"));
});

test("devolve o valor fresco sem chamar a fonte (hit)", async () => {
  const registros: { resultado: string }[] = [];
  const cache = criarCache(registros);

  const primeira = cache.obter(10);
  resolver(posicoes("A"));
  assert.deepEqual(await primeira, posicoes("A"));

  const segunda = await cache.obter(10);
  assert.deepEqual(segunda, posicoes("A"));

  assert.deepEqual(chamadas, [10]);
  assert.deepEqual(registros, [
    { resultado: "10:miss" },
    { resultado: "10:hit" },
  ]);
});

test("expira após o TTL e busca de novo (miss)", async () => {
  const cache = criarCache();

  const primeira = cache.obter(20);
  resolver(posicoes("B"));
  await primeira;

  agoraMs += 6_999;
  await cache.obter(20);
  assert.deepEqual(chamadas, [20], "dentro do TTL é hit");

  agoraMs += 2;
  const renovada = cache.obter(20);
  resolver(posicoes("B2"));
  await renovada;
  assert.deepEqual(chamadas, [20, 20], "após o TTL é miss");
  assert.equal((await renovada).veiculos[0]?.prefixo, "B2");
});

test("deduplica chamadas em voo para a mesma linha", async () => {
  const cache = criarCache();
  const primeira = cache.obter(30);
  const segunda = cache.obter(30);

  resolver(posicoes("C"));
  assert.deepEqual(await primeira, posicoes("C"));
  assert.deepEqual(await segunda, posicoes("C"));
  assert.deepEqual(chamadas, [30]);
});

test("erro não é cacheado: a próxima chamada busca novamente", async () => {
  const cache = criarCache();

  const primeira = cache.obter(40);
  rejeitar(new Error("cima"));
  await assert.rejects(primeira, (erro: unknown) => (erro as Error).message === "cima");

  const segunda = cache.obter(40);
  resolver(posicoes("D"));
  assert.deepEqual(await segunda, posicoes("D"));
  assert.deepEqual(chamadas, [40, 40]);
});

test("erro em voo não impede nova tentativa concorrente", async () => {
  const cache = criarCache();
  const primeira = cache.obter(45);
  rejeitar(new Error("cima"));
  await assert.rejects(primeira);

  const segunda = cache.obter(45);
  resolver(posicoes("E"));
  assert.deepEqual(await segunda, posicoes("E"));
});

test("remove entradas expiradas ao inserir novas", async () => {
  const cache = criarCache();

  const a = cache.obter(1);
  resolver(posicoes("A1"));
  await a;

  const b = cache.obter(2);
  resolver(posicoes("B1"));
  await b;
  assert.equal(cache.tamanho(), 2);

  agoraMs += 8_000;
  const c = cache.obter(3);
  resolver(posicoes("C1"));
  await c;
  assert.equal(cache.tamanho(), 1, "expiradas de linhas antigas foram removidas");
});
