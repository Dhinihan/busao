export type Sentido = "ida" | "volta";

export type Linha = {
  readonly id: number;
  readonly letreiro: string;
  readonly descricao: string;
  readonly sentido?: Sentido;
};

export type PosicaoVeiculo = {
  readonly prefixo: string;
  readonly lat: number;
  readonly lng: number;
  readonly acessivel: boolean;
};

export type PontoRota = {
  readonly lat: number;
  readonly lng: number;
};

export type RotaDaLinha = {
  readonly trechos: readonly (readonly PontoRota[])[];
};

export type PosicoesDaLinha = {
  readonly horario: string;
  readonly veiculos: readonly PosicaoVeiculo[];
};

export type StatusApi = {
  readonly configurado: boolean;
};
