import assert from "node:assert/strict";
import { test } from "node:test";
import { paraPrevisaoDoCliente, paraPrevisaoParada } from "../shared/parsers.ts";

// Fixture da documentação oficial de /Previsao/Parada (SPTrans).
const RESPOSTA_OLHO_VIVO = {
  hr: "20:20",
  p: {
    cp: 4200953,
    np: "PARADA ROBERTO SELMI DEI B/C",
    py: -23.675901,
    px: -46.752812,
    l: [
      {
        c: "675K-10",
        cl: 198,
        sl: 1,
        lt0: "METRO STA CRUZ",
        lt1: "TERM. JD. ANGELA",
        qv: 1,
        vs: [
          {
            p: "73651",
            t: "23:22",
            a: true,
            ta: "2017-05-07T23:20:06Z",
            py: -23.676623333333335,
            px: -46.757641666666665,
          },
        ],
      },
      {
        c: "7021-10",
        cl: 1989,
        sl: 2,
        lt0: "TERM. JOÃO DIAS",
        lt1: "JD. MARACÁ",
        qv: 0,
        vs: [],
      },
    ],
  },
};

test("parser da resposta crua extrai nome, horário e linhas", () => {
  const previsao = paraPrevisaoParada(RESPOSTA_OLHO_VIVO);
  assert.notEqual(previsao, null);
  assert.equal(previsao!.horario, "20:20");
  assert.equal(previsao!.nome, "PARADA ROBERTO SELMI DEI B/C");
  assert.equal(previsao!.lat, -23.675901);
  assert.equal(previsao!.lng, -46.752812);
  assert.equal(previsao!.linhas.length, 2);
  const [comOnibus, semOnibus] = previsao!.linhas;
  assert.equal(comOnibus!.letreiro, "675K-10");
  assert.equal(comOnibus!.cl, 198);
  assert.equal(comOnibus!.destino, "METRO STA CRUZ");
  assert.equal(comOnibus!.previsoes.length, 1);
  assert.equal(comOnibus!.previsoes[0]!.horario, "23:22");
  assert.equal(comOnibus!.previsoes[0]!.acessivel, true);
  assert.equal(semOnibus!.previsoes.length, 0);
});

test("resposta sem corpo de parada é rejeitada", () => {
  assert.equal(paraPrevisaoParada(null), null);
  assert.equal(paraPrevisaoParada({}), null);
  assert.equal(paraPrevisaoParada({ hr: "20:20" }), null);
  assert.equal(paraPrevisaoParada({ hr: "20:20", p: { np: "X" } }), null);
  assert.equal(paraPrevisaoParada({ hr: "20:20", p: { l: "x" } }), null);
});

test("forma do cliente faz ida e volta com dados do servidor", () => {
  const previsao = paraPrevisaoParada(RESPOSTA_OLHO_VIVO)!;
  const serializada = JSON.parse(JSON.stringify(previsao));
  const recebida = paraPrevisaoDoCliente(serializada);
  assert.notEqual(recebida, null);
  assert.equal(recebida!.nome, previsao.nome);
  assert.equal(recebida!.linhas.length, 2);
  assert.equal(recebida!.linhas[0]!.previsoes[0]!.prefixo, "73651");
  assert.equal(recebida!.linhas[0]!.previsoes[0]!.acessivel, true);
});

test("forma do cliente tolera linhas e chegadas malformadas", () => {
  const recebida = paraPrevisaoDoCliente({
    horario: "20:20",
    nome: "PARADA",
    lat: -23.5,
    lng: -46.6,
    linhas: [
      null,
      { letreiro: "8000-10" },
      { cl: "x", letreiro: "8000-10" },
      { cl: 1273, letreiro: "8000-10", previsoes: [{ prefixo: "1" }, null, { prefixo: "2", horario: "10:10" }] },
    ],
  });
  assert.notEqual(recebida, null);
  assert.equal(recebida!.linhas.length, 1);
  const unica = recebida!.linhas[0]!;
  assert.equal(unica.cl, 1273);
  assert.equal(unica.destino, "");
  assert.equal(unica.previsoes.length, 1);
  assert.equal(unica.previsoes[0]!.horario, "10:10");
});
