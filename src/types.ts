export type Linha = {
  readonly id: number;
  readonly letreiro: string;
  readonly descricao: string;
};

export type PosicaoVeiculo = {
  readonly prefixo: string;
  readonly lat: number;
  readonly lng: number;
  readonly acessivel: boolean;
};

export type PosicoesDaLinha = {
  readonly horario: string;
  readonly veiculos: readonly PosicaoVeiculo[];
};

export type StatusApi = {
  readonly configurado: boolean;
  readonly demo: boolean;
  readonly validado: boolean;
};
