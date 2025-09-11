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


export interface ResultadoComparacao {
  algoritmo: string;

  espera: number;
  retorno: number;
  resposta: number;
  justica: number;

  makespan: number;
  utilizacao: number;    
  ociosidade: number;
  throughput: number;
  ctxSwitches: number;
  slowdownMedio: number;
  slowdownMax: number;
  dpEspera: number;
  dpRetorno: number;
  dpResposta: number;
}
