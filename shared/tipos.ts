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

export type PrevisaoChegada = {
  readonly prefixo: string;
  readonly horario: string;
  readonly acessivel: boolean;
};

export type PrevisaoLinha = {
  readonly cl: number;
  readonly letreiro: string;
  readonly destino: string;
  readonly previsoes: readonly PrevisaoChegada[];
};

export type PrevisaoParada = {
  readonly horario: string;
  readonly nome: string;
  readonly lat: number | null;
  readonly lng: number | null;
  readonly linhas: readonly PrevisaoLinha[];
};

export type StatusApi = {
  readonly configurado: boolean;
};
