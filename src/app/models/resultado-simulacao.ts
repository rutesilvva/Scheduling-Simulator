export interface Execucao {
  processoId: string;
  inicio: number;
  fim: number;
}

export interface ResultadoSimulacao {
  execucoes: Execucao[];
  tempoMedioEspera: number;
  tempoMedioRetorno: number;
  tempoMedioResposta: number;
}
