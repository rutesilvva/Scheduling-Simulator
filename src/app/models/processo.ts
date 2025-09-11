export interface Processo {
  id: string;
  tempoChegada: number;  
  duracao: number;        
  prioridade?: number;    
  tickets?: number;

  grupo?: string;         
  share?: number;        
  nice?: number;          
  mlqFilaInicial?: 'FG' | 'BG' | number;
  mlfqNivelInicial?: number;            
  periodo?: number;       
  deadline?: number;      
}
