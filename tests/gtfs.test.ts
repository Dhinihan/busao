import assert from "node:assert/strict";
import { test } from "node:test";
import {
  casarParadas,
  csvParaRegistros,
  distanciaMetros,
  expandirJanela,
  extrairCores,
  extrairRotas,
  prefixoLetreiro,
  tiposDiaDoServico,
} from "../shared/gtfs.ts";

test("csvParaRegistros lida com vírgula e quebra de linha dentro de aspas", () => {
  const registros = csvParaRegistros(
    'stop_id,stop_name\n"1","R. Foo, 254"\n"2","Terminal\nPinheiros"',
  );
  assert.deepEqual(registros, [
    { stop_id: "1", stop_name: "R. Foo, 254" },
    { stop_id: "2", stop_name: "Terminal\nPinheiros" },
  ]);
});

test("expandirJanela gera partidas no passo informado", () => {
  assert.deepEqual(
    expandirJanela({ inicio: "06:00", fim: "06:59", intervaloSegundos: 480 }),
    ["06:00", "06:08", "06:16", "06:24", "06:32", "06:40", "06:48", "06:56"],
  );
});

test("expandirJanela com passo que não fecha a hora para no limite", () => {
  assert.deepEqual(
    expandirJanela({ inicio: "05:00", fim: "05:59", intervaloSegundos: 1200 }),
    ["05:00", "05:20", "05:40"],
  );
});

test("expandirJanela trata end_time como limite exclusivo (spec GTFS)", () => {
  assert.deepEqual(
    expandirJanela({ inicio: "06:00", fim: "06:30", intervaloSegundos: 1800 }),
    ["06:00"],
  );
});

test("expandirJanela rejeita janelas vazias ou invertidas", () => {
  assert.deepEqual(
    expandirJanela({ inicio: "07:00", fim: "06:00", intervaloSegundos: 600 }),
    [],
  );
  assert.deepEqual(
    expandirJanela({ inicio: "07:00", fim: "07:00", intervaloSegundos: 0 }),
    [],
  );
});

test("tiposDiaDoServico mapeia os serviços do calendar da SPTrans", () => {
  const linha = (valores: string): Record<string, string> =>
    Object.fromEntries(
      ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        .map((dia, i) => [dia, valores[i] ?? ""]),
    );
  assert.deepEqual(tiposDiaDoServico(linha("1111100")), ["util"]);
  assert.deepEqual(tiposDiaDoServico(linha("0000010")), ["sab"]);
  assert.deepEqual(tiposDiaDoServico(linha("0000001")), ["dom"]);
  assert.deepEqual(tiposDiaDoServico(linha("1111111")), ["util", "sab", "dom"]);
  assert.deepEqual(tiposDiaDoServico(linha("1000000")), []);
  assert.deepEqual(tiposDiaDoServico(linha("1000100")), []);
});

function fixture() {
  const registro = (pares: Record<string, string>) => pares;
  return {
    rotas: [registro({ route_id: "477A-10", route_long_name: "Sacomã - Term. Pinheiros" })],
    viagens: [
      registro({ route_id: "477A-10", service_id: "US_", trip_id: "t0", direction_id: "0" }),
      registro({ route_id: "477A-10", service_id: "_S_", trip_id: "t1", direction_id: "1" }),
    ],
    tempos: [
      registro({ trip_id: "t0", stop_sequence: "1", stop_id: "s1", departure_time: "17:00:00" }),
      registro({ trip_id: "t1", stop_sequence: "1", stop_id: "s2", departure_time: "09:10:00" }),
    ],
    frequencias: [
      registro({ trip_id: "t0", start_time: "06:00", end_time: "06:30", headway_secs: "900" }),
      registro({ trip_id: "t0", start_time: "07:00", end_time: "07:20", headway_secs: "1200" }),
    ],
    calendar: [
      registro({ service_id: "US_", monday: "1", tuesday: "1", wednesday: "1", thursday: "1", friday: "1", saturday: "1", sunday: "0" }),
      registro({ service_id: "_S_", monday: "0", tuesday: "0", wednesday: "0", thursday: "0", friday: "0", saturday: "1", sunday: "0" }),
    ],
    paradas: [
      registro({ stop_id: "s1", stop_name: "Terminal Lapa - Plat. 1" }),
      registro({ stop_id: "s2", stop_name: "Pça. Ramos De Azevedo" }),
    ],
  };
}

test("extrairRotas une janelas por tipo de dia e usa stop_times quando falta frequencies", () => {
  const rotas = extrairRotas(fixture());
  assert.equal(rotas.length, 1);
  const rota = rotas[0];
  assert.ok(rota);
  assert.equal(rota.routeId, "477A-10");
  assert.deepEqual(rota.sentidos.map((s) => s.directionId), [0, 1]);

  const ida = rota.sentidos[0];
  assert.ok(ida);
  assert.equal(ida.origem, "Terminal Lapa - Plat. 1");
  // US_ cobre dia útil e sábado; _S_ só sábado. end_time é exclusivo.
  assert.deepEqual(ida.partidas.util, ["06:00", "06:15", "07:00"]);
  assert.deepEqual(ida.partidas.sab, ["06:00", "06:15", "07:00"]);
  assert.deepEqual(ida.partidas.dom, []);

  const volta = rota.sentidos[1];
  assert.ok(volta);
  assert.equal(volta.origem, "Pça. Ramos De Azevedo");
  // Sem frequencies: cai na partida da primeira stop_time.
  assert.deepEqual(volta.partidas.sab, ["09:10"]);
  assert.deepEqual(volta.partidas.util, []);
});

test("prefixoLetreiro separa sufixo do letreiro", () => {
  assert.equal(prefixoLetreiro("477A-10"), "477A");
  assert.equal(prefixoLetreiro("8000-10"), "8000");
  assert.equal(prefixoLetreiro("SEMTRACO"), "SEMTRACO");
});

test("extrairCores mapeia letreiro para route_color com #", () => {
  const registros = csvParaRegistros(
    'route_id,route_color\n"8000-10","FF671F"\n"8000-21","FF671F"\n"N106-11","0082BA"',
  );
  assert.deepEqual(extrairCores(registros), {
    "8000": "#FF671F",
    N106: "#0082BA",
  });
});

test("extrairCores descarta cor ausente ou malformada", () => {
  const registros = csvParaRegistros(
    ['route_id,route_color', '"A-10",""', '"B-10","VERDE"', '"C-10","00BFFF"'].join("\n"),
  );
  assert.deepEqual(extrairCores(registros), { C: "#00BFFF" });
});

test("extrairCores: primeira variante vence quando variantes divergem", () => {
  const registros = csvParaRegistros(
    'route_id,route_color\n"3063-10","DA291C"\n"3063-11","FFD100"',
  );
  assert.deepEqual(extrairCores(registros), { "3063": "#DA291C" });
});

test("distanciaMetros mede curta distância com precisão de rua", () => {
  // Av. Paulista 1000 → 1400 (~200 m ao longo da avenida)
  const metros = distanciaMetros(
    { lat: -23.561414, lng: -46.655881 },
    { lat: -23.561414, lng: -46.653571 },
  );
  assert.ok(metros > 220 && metros < 250, `esperava ~235 m, veio ${metros}`);
  assert.equal(distanciaMetros({ lat: -23.5, lng: -46.6 }, { lat: -23.5, lng: -46.6 }), 0);
});

test("casarParadas casa por proximidade e letreiro da linha", () => {
  const paradasGtfs = new Map([
    ["1", { lat: -23.5500, lng: -46.6400, letreiros: new Set(["8000"]) }],
    ["2", { lat: -23.5501, lng: -46.6401, letreiros: new Set(["N106"]) }],
    ["3", { lat: -23.9000, lng: -46.9000, letreiros: new Set(["8000"]) }],
  ]);
  const pares = casarParadas({
    paradasGtfs,
    paradasOlhoVivo: [
      { cp: 111, nome: "A", lat: -23.55002, lng: -46.64002 },
      { cp: 222, nome: "B", lat: -23.9001, lng: -46.9001 },
    ],
    letreiros: new Set(["8000"]),
  });
  // cp 111 casa com a parada 1 (perto e com o letreiro); a 2 é mais perto
  // ainda, mas só tem N106 — fora do letreiro consultado. cp 222 casa com a 3.
  assert.deepEqual(pares, [["1", 111], ["3", 222]]);
});

test("casarParadas: cada stop_id e cada cp entram em no máximo um par", () => {
  // Sem a regra, o casamento ganancioso daria dois pares para a mesma
  // parada GTFS (A é o par mais próximo e B o segundo) e dois pares para o
  // mesmo cp. O resultado tem que trancar os dois lados.
  const paradasGtfs = new Map([
    ["1", { lat: -23.55, lng: -46.64, letreiros: new Set(["8000"]) }],
  ]);
  const pares = casarParadas({
    paradasGtfs,
    paradasOlhoVivo: [
      { cp: 111, nome: "A", lat: -23.55, lng: -46.64 },
      { cp: 222, nome: "B", lat: -23.55005, lng: -46.64 },
    ],
    letreiros: new Set(["8000"]),
  });
  assert.deepEqual(pares, [["1", 111]]);

  const paradasGtfs2 = new Map([
    ["1", { lat: -23.55, lng: -46.64, letreiros: new Set(["8000"]) }],
    ["2", { lat: -23.55004, lng: -46.64, letreiros: new Set(["8000"]) }],
  ]);
  const pares2 = casarParadas({
    paradasGtfs: paradasGtfs2,
    paradasOlhoVivo: [{ cp: 333, nome: "C", lat: -23.55001, lng: -46.64 }],
    letreiros: new Set(["8000"]),
  });
  // cp 333 casa com a parada 1 (mais próxima); a 2 fica sem par.
  assert.deepEqual(pares2, [["1", 333]]);
});

test("casarParadas ignora paradas além do limiar", () => {
  const paradasGtfs = new Map([
    ["1", { lat: -23.55, lng: -46.64, letreiros: new Set(["8000"]) }],
  ]);
  const pares = casarParadas({
    paradasGtfs,
    paradasOlhoVivo: [{ cp: 111, nome: "A", lat: -23.552, lng: -46.64 }],
    letreiros: new Set(["8000"]),
    limiteMetros: 80,
  });
  assert.deepEqual(pares, []);
});
