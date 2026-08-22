import type { Linha, PosicoesDaLinha, PosicaoVeiculo } from "./olhovivo.ts";

type TrajetoDemo = {
  readonly id: number;
  readonly letreiro: string;
  readonly descricao: string;
  readonly origem: readonly [number, number];
  readonly destino: readonly [number, number];
  readonly frota: number;
};

const TRAJETOS: readonly TrajetoDemo[] = [
  {
    id: 1001,
    letreiro: "8000-10",
    descricao: "Term. Pq. D. Pedro II → Metrô Belém",
    origem: [-23.5453, -46.6244],
    destino: [-23.5555, -46.6101],
    frota: 7,
  },
  {
    id: 1002,
    letreiro: "702U-10",
    descricao: "Term. Campo Limpo → Av. Paulista",
    origem: [-23.6438, -46.6746],
    destino: [-23.5614, -46.6559],
    frota: 9,
  },
  {
    id: 1003,
    letreiro: "477P-10",
    descricao: "Cid. A.E. Carvalho → Term. Pq. D. Pedro II",
    origem: [-23.5015, -46.6097],
    destino: [-23.5453, -46.6244],
    frota: 6,
  },
  {
    id: 1004,
    letreiro: "917M-10",
    descricao: "Term. Vila Prudente → Metrô Sé",
    origem: [-23.5854, -46.5831],
    destino: [-23.5505, -46.6333],
    frota: 8,
  },
  {
    id: 1005,
    letreiro: "N106-11",
    descricao: "Term. Lapa → Av. Paulista",
    origem: [-23.5224, -46.6693],
    destino: [-23.5614, -46.6559],
    frota: 5,
  },
  {
    id: 1006,
    letreiro: "6368-10",
    descricao: "Term. Grajaú → Est. da Luz",
    origem: [-23.7011, -46.6971],
    destino: [-23.5352, -46.6343],
    frota: 10,
  },
];

const CICLO_SEGUNDOS = 240;

function posicoesDoTrajeto(trajeto: TrajetoDemo): PosicoesDaLinha {
  const segundos = Date.now() / 1000;
  const veiculos: PosicaoVeiculo[] = [];
  for (let i = 0; i < trajeto.frota; i += 1) {
    const fase = (segundos / CICLO_SEGUNDOS + i / trajeto.frota) % 2;
    const progresso = fase < 1 ? fase : 2 - fase;
    const oscilacao = Math.sin(segundos / 6 + i * 2.4) * 0.0009;
    veiculos.push({
      prefixo: String(12000 + trajeto.id * 10 + i),
      lat:
        trajeto.origem[0] +
        (trajeto.destino[0] - trajeto.origem[0]) * progresso +
        oscilacao,
      lng:
        trajeto.origem[1] +
        (trajeto.destino[1] - trajeto.origem[1]) * progresso -
        oscilacao,
      acessivel: i % 3 !== 2,
    });
  }
  return {
    horario: new Date().toLocaleTimeString("pt-BR", { hour12: false }),
    veiculos,
  };
}

export function linhasDemo(): readonly Linha[] {
  return TRAJETOS.map((t) => ({
    id: t.id,
    letreiro: t.letreiro,
    descricao: t.descricao,
  }));
}

export function posicoesDemo(idLinha: number): PosicoesDaLinha | null {
  const trajeto = TRAJETOS.find((t) => t.id === idLinha);
  if (trajeto === undefined) return null;
  return posicoesDoTrajeto(trajeto);
}
