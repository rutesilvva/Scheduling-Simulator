export interface Processo {
  // Essenciais
  id: string;
  tempoChegada: number;   // release
  duracao: number;        // WCET/burst
  prioridade?: number;    // para "Prioridade" e Aging

  // Lottery / Stride
  tickets?: number;

  // Fair-Share / CFS
  grupo?: string;         // agrupamento opcional (livre)
  share?: number;         // peso de fair-share
  nice?: number;          // peso CFS (alternativo a share)

  // MLQ / MLFQ
  mlqFilaInicial?: 'FG' | 'BG' | number; // classe/fila inicial (MLQ)
  mlfqNivelInicial?: number;             // nível inicial (MLFQ)

  // Tempo real
  periodo?: number;       // RM
  deadline?: number;      // DM (relativa ao release)
}
