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

  simularMLFQ(
    processos: Processo[],
    cfg: { niveis: number; quantumBase: number; boost: number }
  ): ResultadoSimulacao {
    const N = Math.max(1, (cfg.niveis|0) || 3);
    const qb = Math.max(1, (cfg.quantumBase|0) || 2);
    const boostPeriod = Math.max(1, (cfg.boost|0) || 50);

    type P = Processo & { restante:number; nivel:number; ultimoEntra:number };
    const base = this.copia(processos);
    const procs: P[] = base.map(p => ({
      ...p, restante: p.duracao, nivel: 0, ultimoEntra: p.tempoChegada
    }));

    const filas: P[][] = Array.from({length:N}, ()=>[]);
    const execucoes: Execucao[] = [];
    let tempo = Math.min(...procs.map(p=>p.tempoChegada));
    let ultimoBoost = tempo;

    const quantumNivel = (lvl:number) => qb * (1 << lvl);

    const empurrarChegadas = () => {
      procs
        .filter(p => p.tempoChegada <= tempo && p.restante > 0 && !filas.some(f=>f.includes(p)))
        .forEach(p => filas[0].push(p)); 
    };

    const allDone = () => procs.every(p=>p.restante<=0);

    while (!allDone()) {
      if (tempo - ultimoBoost >= boostPeriod) {
        const ativos = procs.filter(p => p.restante > 0 && p.tempoChegada <= tempo);
        ativos.forEach(p => p.nivel = 0);
        filas.forEach(f => f.splice(0, f.length));
        ativos.sort((a,b)=> a.ultimoEntra - b.ultimoEntra).forEach(p => filas[0].push(p));
        ultimoBoost = tempo;
      }

      empurrarChegadas();

      const idxFila = filas.findIndex(f => f.length);
      if (idxFila < 0) { tempo++; continue; }

      const p = filas[idxFila].shift()!;
      const q = quantumNivel(p.nivel);
      const uso = Math.min(q, p.restante);

      execucoes.push({ processoId: p.id, inicio: tempo, fim: tempo + uso });
      tempo += uso;
      p.restante -= uso;
      p.ultimoEntra = tempo;

      empurrarChegadas();

      if (p.restante > 0) {
        p.nivel = Math.min(N-1, p.nivel + 1); 
        filas[p.nivel].push(p);
      }
    }

    return this.calcularMetricas(base, this.fundirAdjacentes(execucoes));
  }

 
  simularLottery(
    processos: Processo[],
    cfg: { ticketsPadrao: number }
  ): ResultadoSimulacao {
    const ticketsPadrao = Math.max(1, (cfg?.ticketsPadrao|0) || 100);
    type P = Processo & { restante:number; tickets:number };

    const base = this.copia(processos);
    const procs: P[] = base.map(p => ({ ...p, restante: p.duracao, tickets: ticketsPadrao }));

    const execucoes: Execucao[] = [];
    let tempo = Math.min(...procs.map(p=>p.tempoChegada));

    const allDone = () => procs.every(p=>p.restante<=0);

    while (!allDone()) {
      const ready = procs.filter(p => p.tempoChegada <= tempo && p.restante > 0);
      if (!ready.length) { tempo++; continue; }

      const total = ready.reduce((s,p)=> s + p.tickets, 0);
      let r = Math.random() * total;
      let escolha = ready[0];
      for (const p of ready) { r -= p.tickets; if (r <= 0) { escolha = p; break; } }

      execucoes.push({ processoId: escolha.id, inicio: tempo, fim: tempo + 1 });
      escolha.restante -= 1;
      tempo += 1;
    }

    return this.calcularMetricas(base, this.fundirAdjacentes(execucoes));
  }

 
  simularStride(
    processos: Processo[],
    cfg: { ticketsPadrao: number }
  ): ResultadoSimulacao {
    const ticketsPadrao = Math.max(1, (cfg?.ticketsPadrao|0) || 100);
    const K = 10000;

    type P = Processo & { restante:number; tickets:number; stride:number; pass:number };
    const base = this.copia(processos);
    const procs: P[] = base.map(p => ({
      ...p,
      restante: p.duracao,
      tickets: ticketsPadrao,
      stride: Math.floor(K / ticketsPadrao),
      pass: 0
    }));

    const execucoes: Execucao[] = [];
    let tempo = Math.min(...procs.map(p=>p.tempoChegada));

    const allDone = () => procs.every(p=>p.restante<=0);

    while (!allDone()) {
      const ready = procs.filter(p => p.tempoChegada <= tempo && p.restante > 0);
      if (!ready.length) { tempo++; continue; }

      ready.sort((a,b)=> a.pass - b.pass || a.tempoChegada - b.tempoChegada);
      const cur = ready[0];

      execucoes.push({ processoId: cur.id, inicio: tempo, fim: tempo + 1 });
      cur.restante -= 1;
      cur.pass += cur.stride;
      tempo += 1;
    }

    return this.calcularMetricas(base, this.fundirAdjacentes(execucoes));
  }

 
  simularFairShare(
    processos: Processo[],
    cfg: { sharePadrao: number }
  ): ResultadoSimulacao {
    const sharePadrao = Math.max(1, (cfg?.sharePadrao|0) || 1);
    type P = Processo & { restante:number; share:number; usado:number };

    const base = this.copia(processos);
    const procs: P[] = base.map(p => ({ ...p, restante: p.duracao, share: sharePadrao, usado: 0 }));

    const execucoes: Execucao[] = [];
    let tempo = Math.min(...procs.map(p=>p.tempoChegada));

    const allDone = () => procs.every(p=>p.restante<=0);

    while (!allDone()) {
      const ready = procs.filter(p => p.tempoChegada <= tempo && p.restante > 0);
      if (!ready.length) { tempo++; continue; }

      ready.sort((a,b)=> (a.usado/a.share) - (b.usado/b.share) || a.tempoChegada - b.tempoChegada);
      const cur = ready[0];

      execucoes.push({ processoId: cur.id, inicio: tempo, fim: tempo + 1 });
      cur.restante -= 1;
      cur.usado += 1;
      tempo += 1;
    }

    return this.calcularMetricas(base, this.fundirAdjacentes(execucoes));
  }


  simularCFS(
    processos: Processo[],
    cfg: { nicePadrao: number }
  ): ResultadoSimulacao {
    const nicePadrao = (cfg?.nicePadrao ?? 0) | 0;

    const weightFromNice = (n: number) => {
      return Math.max(1, Math.floor(1024 / Math.pow(1.25, n)));
    };

    type P = Processo & { restante:number; vruntime:number; weight:number };
    const base = this.copia(processos);
    const procs: P[] = base.map(p => ({
      ...p, restante: p.duracao, vruntime: 0, weight: weightFromNice(nicePadrao)
    }));

    const execucoes: Execucao[] = [];
    let tempo = Math.min(...procs.map(p=>p.tempoChegada));

    const allDone = () => procs.every(p=>p.restante<=0);

    while (!allDone()) {
      const ready = procs.filter(p => p.tempoChegada <= tempo && p.restante > 0);
      if (!ready.length) { tempo++; continue; }

      ready.sort((a,b)=> a.vruntime - b.vruntime || a.tempoChegada - b.tempoChegada);
      const cur = ready[0];

      execucoes.push({ processoId: cur.id, inicio: tempo, fim: tempo + 1 });
      cur.restante -= 1;
      cur.vruntime += (1024 / cur.weight); 
      tempo += 1;
    }

    return this.calcularMetricas(base, this.fundirAdjacentes(execucoes));
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
