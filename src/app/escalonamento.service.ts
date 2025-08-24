import { Injectable } from '@angular/core';
import { Processo } from './models/processo';
import { Execucao, ResultadoSimulacao } from './models/resultado-simulacao';

type ProcessoRestante = Processo & { restante: number };

@Injectable({ providedIn: 'root' })
export class EscalonamentoService {

  simularFCFS(processos: Processo[]): ResultadoSimulacao {
    const lista = this.copia(processos).sort((a,b)=>a.tempoChegada-b.tempoChegada);
    let tempo = 0;
    const execucoes: Execucao[] = [];

    for (const p of lista) {
      if (tempo < p.tempoChegada) tempo = p.tempoChegada;
      const inicio = tempo;
      const fim = inicio + p.duracao;
      execucoes.push({ processoId: p.id, inicio, fim });
      tempo = fim;
    }
    return this.calcularMetricas(lista, execucoes);
  }

  simularSJF(processos: Processo[]): ResultadoSimulacao {
    const porChegada = this.copia(processos).sort((a,b)=>a.tempoChegada-b.tempoChegada);
    const prontos: Processo[] = [];
    const execucoes: Execucao[] = [];
    let tempo = 0, i = 0;

    while (i < porChegada.length || prontos.length) {
      while (i < porChegada.length && porChegada[i].tempoChegada <= tempo) prontos.push(porChegada[i++]);
      if (!prontos.length) { tempo = porChegada[i].tempoChegada; continue; }

      prontos.sort((a,b)=>a.duracao-b.duracao || a.tempoChegada-b.tempoChegada || a.id.localeCompare(b.id));
      const p = prontos.shift()!;
      const inicio = Math.max(tempo, p.tempoChegada);
      const fim = inicio + p.duracao;
      execucoes.push({ processoId: p.id, inicio, fim });
      tempo = fim;
    }
    return this.calcularMetricas(porChegada, execucoes);
  }

  simularSRTF(processos: Processo[]): ResultadoSimulacao {
    const porChegada = this.copia(processos)
      .map(p=>({ ...p, restante: p.duracao }))
      .sort((a,b)=>a.tempoChegada-b.tempoChegada);

    const execucoes: Execucao[] = [];
    const prontos: ProcessoRestante[] = [];
    let tempo = 0, i = 0;
    let atual: ProcessoRestante | null = null;

    const empurrarChegados = (ate: number) => {
      while (i < porChegada.length && porChegada[i].tempoChegada <= ate) prontos.push(porChegada[i++]);
    };

    while (i < porChegada.length || prontos.length || atual) {
      if (!atual && !prontos.length) {
        tempo = Math.max(tempo, porChegada[i].tempoChegada);
        empurrarChegados(tempo);
      }
      if (!atual) {
        prontos.sort((a,b)=>a.restante-b.restante || a.tempoChegada-b.tempoChegada || a.id.localeCompare(b.id));
        atual = prontos.shift()!;
        tempo = Math.max(tempo, atual.tempoChegada);
      }

      const proximaChegada = i < porChegada.length ? porChegada[i].tempoChegada : Number.POSITIVE_INFINITY;
      const fatia = Math.min(atual.restante, proximaChegada - tempo);

      if (isFinite(fatia) && fatia > 0) {
        execucoes.push({ processoId: atual.id, inicio: tempo, fim: tempo + fatia });
        tempo += fatia;
        atual.restante -= fatia;
      }

      empurrarChegados(tempo);

      if (atual.restante <= 0) {
        atual = null;
      } else {
        const melhor = [...prontos].sort((a,b)=>a.restante-b.restante)[0];
        if (melhor && melhor.restante < atual.restante) {
          prontos.push(atual);
          atual = null;
        }
      }
    }

    const base: Processo[] = porChegada.map(({id,tempoChegada,duracao,prioridade}) =>
      ({ id, tempoChegada, duracao, prioridade })
    );

    return this.calcularMetricas(base, this.fundirAdjacentes(execucoes));
  }

  simularRR(processos: Processo[], quantum: number): ResultadoSimulacao {
    if (quantum <= 0) throw new Error('Quantum deve ser > 0');

    const porChegada = this.copia(processos)
      .map(p=>({ ...p, restante: p.duracao }))
      .sort((a,b)=>a.tempoChegada-b.tempoChegada);

    const fila: ProcessoRestante[] = [];
    const execucoes: Execucao[] = [];
    let tempo = 0, i = 0;

    if (porChegada.length) tempo = porChegada[0].tempoChegada;
    while (i < porChegada.length && porChegada[i].tempoChegada <= tempo) fila.push(porChegada[i++]);

    while (fila.length || i < porChegada.length) {
      if (!fila.length && i < porChegada.length) {
        tempo = Math.max(tempo, porChegada[i].tempoChegada);
        while (i < porChegada.length && porChegada[i].tempoChegada <= tempo) fila.push(porChegada[i++]);
      }
      const p = fila.shift()!;
      const rodar = Math.min(quantum, p.restante);
      execucoes.push({ processoId: p.id, inicio: tempo, fim: tempo + rodar });
      tempo += rodar;
      p.restante -= rodar;

      while (i < porChegada.length && porChegada[i].tempoChegada <= tempo) fila.push(porChegada[i++]);
      if (p.restante > 0) fila.push(p);
    }

    const base: Processo[] = porChegada.map(({id,tempoChegada,duracao,prioridade}) =>
      ({ id, tempoChegada, duracao, prioridade })
    );

    return this.calcularMetricas(base, this.fundirAdjacentes(execucoes));
  }

  simularPrioridade(processos: Processo[]): ResultadoSimulacao {
    const porChegada = this.copia(processos).sort((a,b)=>a.tempoChegada-b.tempoChegada);
    const prontos: Processo[] = [];
    const execucoes: Execucao[] = [];
    let tempo = 0, i = 0;

    while (i < porChegada.length || prontos.length) {
      while (i < porChegada.length && porChegada[i].tempoChegada <= tempo) prontos.push(porChegada[i++]);
      if (!prontos.length) { tempo = porChegada[i].tempoChegada; continue; }

      prontos.sort((a,b)=>{
        const pa = a.prioridade ?? Number.POSITIVE_INFINITY;
        const pb = b.prioridade ?? Number.POSITIVE_INFINITY;
        return pa - pb || a.tempoChegada - b.tempoChegada || a.id.localeCompare(b.id);
      });
      const p = prontos.shift()!;
      const inicio = Math.max(tempo, p.tempoChegada);
      const fim = inicio + p.duracao;
      execucoes.push({ processoId: p.id, inicio, fim });
      tempo = fim;
    }
    return this.calcularMetricas(porChegada, execucoes);
  }

  private copia<T>(arr: T[]): T[] { return JSON.parse(JSON.stringify(arr)); }

  private fundirAdjacentes(execs: Execucao[]): Execucao[] {
    if (!execs.length) return execs;
    const saida: Execucao[] = [];
    let atual = { ...execs[0] };
    for (let i = 1; i < execs.length; i++) {
      const e = execs[i];
      if (e.processoId === atual.processoId && e.inicio === atual.fim) {
        atual.fim = e.fim;
      } else {
        saida.push(atual);
        atual = { ...e };
      }
    }
    saida.push(atual);
    return saida;
  }

  private calcularMetricas(processos: Processo[], execucoes: Execucao[]): ResultadoSimulacao {
    const mapa = new Map<string, { primeiroInicio: number; conclusao: number; totalExecutado: number }>();
    for (const p of processos) {
      mapa.set(p.id, { primeiroInicio: Number.POSITIVE_INFINITY, conclusao: 0, totalExecutado: 0 });
    }

    for (const e of execucoes) {
      const m = mapa.get(e.processoId)!;
      m.primeiroInicio = Math.min(m.primeiroInicio, e.inicio);
      m.conclusao = Math.max(m.conclusao, e.fim);
      m.totalExecutado += (e.fim - e.inicio);
    }

    const espera: number[] = [];
    const retorno: number[] = [];
    const resposta: number[] = [];

    for (const p of processos) {
      const m = mapa.get(p.id)!;
      const primeiro = isFinite(m.primeiroInicio) ? m.primeiroInicio : p.tempoChegada;
      const tat = m.conclusao - p.tempoChegada;   
      const wt  = tat - m.totalExecutado;         
      const rt  = primeiro - p.tempoChegada;      
      espera.push(wt);
      retorno.push(tat);
      resposta.push(rt);
    }

    const media = (a: number[]) => a.reduce((x,y)=>x+y,0)/(a.length||1);

    return {
      execucoes,
      tempoMedioEspera:   +media(espera).toFixed(2),
      tempoMedioRetorno:  +media(retorno).toFixed(2),
      tempoMedioResposta: +media(resposta).toFixed(2),
    };
  }
}
