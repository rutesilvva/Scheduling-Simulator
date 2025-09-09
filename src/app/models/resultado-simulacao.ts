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

/**
 * Linha de resumo por algoritmo (usada na tabela e nos gráficos).
 * Mantive `algoritmo` como string para não amarrar ao tipo Algoritmo do componente.
 */
export interface ResultadoComparacao {
  algoritmo: string;

  // clássicas
  espera: number;
  retorno: number;
  resposta: number;
  justica: number;

  // gerais novas
  makespan: number;
  utilizacao: number;     // 0..1
  ociosidade: number;
  throughput: number;
  ctxSwitches: number;
  slowdownMedio: number;
  slowdownMax: number;
  dpEspera: number;
  dpRetorno: number;
  dpResposta: number;
}
