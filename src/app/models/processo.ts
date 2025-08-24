export interface Processo {
  id: string;
  tempoChegada: number;
  duracao: number;        
  prioridade?: number;    
}
