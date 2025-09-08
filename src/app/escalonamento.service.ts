import { Injectable } from '@angular/core';
import { Processo } from './models/processo';
import { Execucao, ResultadoSimulacao } from './models/resultado-simulacao';

type ProcessoRestante = Processo & { restante: number };
type ProcessoExt = Processo & { period?: number; deadline?: number; classe?: string };

@Injectable({ providedIn: 'root' })
export class EscalonamentoService {



  private vazio(): ResultadoSimulacao {
    return { execucoes: [], tempoMedioEspera: 0, tempoMedioRetorno: 0, tempoMedioResposta: 0 };
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
    if (!processos.length) return this.vazio();

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


  simularFCFS(processos: Processo[]): ResultadoSimulacao {
    if (!processos?.length) return this.vazio();

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
    if (!processos?.length) return this.vazio();

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
    if (!processos?.length) return this.vazio();

    const porChegada = this.copia(processos)
      .map(p=>({ ...p, restante: p.duracao } as ProcessoRestante))
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
    if (!processos?.length) return this.vazio();
    if (quantum <= 0) throw new Error('Quantum deve ser > 0');

    const porChegada = this.copia(processos)
      .map(p=>({ ...p, restante: p.duracao } as ProcessoRestante))
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
    if (!processos?.length) return this.vazio();

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
    if (!processos?.length) return this.vazio();

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
    cfg: { ticketsPadrao: number; seed?: number }
  ): ResultadoSimulacao {
    if (!processos?.length) return this.vazio();

    const ticketsPadrao = Math.max(1, (cfg?.ticketsPadrao|0) || 100);

    let s = (cfg?.seed ?? 123456789) >>> 0;
    const rand = () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32;

    type P = Processo & { restante:number; tickets:number };

    const base = this.copia(processos);
    const procs: P[] = base.map(p => ({ ...p, restante: p.duracao, tickets: ticketsPadrao }));

    const execucoes: Execucao[] = [];
    let tempo = Math.min(...procs.map(p=>p.tempoChegada));

    const allDone = () => procs.every(p=>p.restante<=0);

    while (!allDone()) {
      const ready = procs.filter(p => p.tempoChegada <= tempo && p.restante > 0);
      if (!ready.length) { tempo++; continue; }

      const total = ready.reduce((sum,p)=> sum + p.tickets, 0);
      let r = rand() * total; 
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
    if (!processos?.length) return this.vazio();

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
    if (!processos?.length) return this.vazio();

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
    if (!processos?.length) return this.vazio();

    const nicePadrao = (cfg?.nicePadrao ?? 0) | 0;
    const weightFromNice = (n: number) => Math.max(1, Math.floor(1024 / Math.pow(1.25, n)));

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


  simularHRRN(processos: Processo[]): ResultadoSimulacao {
    if (!processos?.length) return this.vazio();

    const base = this.copia(processos).sort((a,b)=>a.tempoChegada-b.tempoChegada);
    const execs: Execucao[] = [];
    let tempo = 0;
    let i = 0;
    const prontos: Processo[] = [];

    while (i < base.length || prontos.length) {
      while (i < base.length && base[i].tempoChegada <= tempo) prontos.push(base[i++]);
      if (!prontos.length) { tempo = base[i].tempoChegada; continue; }

      const escolha = [...prontos]
        .map(p => ({
          p,
          ratio: ((tempo - p.tempoChegada) + p.duracao) / p.duracao
        }))
        .sort((a,b) => b.ratio - a.ratio || a.p.tempoChegada - b.p.tempoChegada || a.p.id.localeCompare(b.p.id))[0].p;

      const idx = prontos.findIndex(x => x.id === escolha.id);
      prontos.splice(idx, 1);

      const inicio = Math.max(tempo, escolha.tempoChegada);
      const fim = inicio + escolha.duracao;
      execs.push({ processoId: escolha.id, inicio, fim });
      tempo = fim;
    }

    return this.calcularMetricas(base, execs);
  }

 
  simularPrioridadeAging(
    processos: Processo[],
    cfg: { rate: number }
  ): ResultadoSimulacao {
    if (!processos?.length) return this.vazio();

    const rate = Number(cfg?.rate ?? 0.1);
    type P = Processo & { restante: number; exec: number };
    const base = this.copia(processos);
    const procs: P[] = base.map(p => ({ ...p, restante: p.duracao, exec: 0 }));

    const execs: Execucao[] = [];
    let tempo = Math.min(...procs.map(p => p.tempoChegada));
    const fim = () => procs.every(p => p.restante <= 0);

    const score = (p: P, t: number) => {
      const prio = p.prioridade ?? 1000;
      const waited = Math.max(0, t - p.tempoChegada - p.exec);
      return prio - rate * waited; 
    };

    while (!fim()) {
      const ready = procs.filter(p => p.tempoChegada <= tempo && p.restante > 0);
      if (!ready.length) { tempo++; continue; }

      ready.sort((a,b)=> score(a, tempo) - score(b, tempo) || a.tempoChegada - b.tempoChegada);
      const cur = ready[0];

      execs.push({ processoId: cur.id, inicio: tempo, fim: tempo + 1 });
      cur.restante -= 1;
      cur.exec += 1;
      tempo += 1;
    }

    return this.calcularMetricas(base, this.fundirAdjacentes(execs));
  }


  simularMLQ(
    processos: Processo[],
    cfg: { fgPolitica: 'RR'|'FCFS'; fgQuantum: number; bgPolitica: 'FCFS'|'RR'; bgQuantum: number }
  ): ResultadoSimulacao {
    if (!processos?.length) return this.vazio();

    type P = Processo & { restante:number; classe:'FG'|'BG' };
    const fgQ = Math.max(1, cfg?.fgQuantum ?? 2);
    const bgQ = Math.max(1, cfg?.bgQuantum ?? 4);
    const fgPol = (cfg?.fgPolitica || 'RR').toUpperCase() as 'RR'|'FCFS';
    const bgPol = (cfg?.bgPolitica || 'FCFS').toUpperCase() as 'FCFS'|'RR';

    const base = this.copia(processos);
    const procs: P[] = base.map(p => ({
      ...p,
      restante: p.duracao,
      classe: (p.prioridade ?? Number.POSITIVE_INFINITY) <= 1 ? 'FG' : 'BG'
    }));

    const execs: Execucao[] = [];
    let tempo = Math.min(...procs.map(p=>p.tempoChegada));

    const done = () => procs.every(p=>p.restante<=0);

    const nextArrivalFG = (t: number) => {
      const arrs = procs.filter(p => p.classe==='FG' && p.restante>0 && p.tempoChegada > t).map(p => p.tempoChegada);
      return arrs.length ? Math.min(...arrs) : Number.POSITIVE_INFINITY;
    };

    const filaFG: P[] = [];
    const filaBG: P[] = [];

    const enfileirarChegados = () => {
      procs.filter(p => p.restante>0 && p.tempoChegada <= tempo)
           .forEach(p => {
             const fila = p.classe==='FG' ? filaFG : filaBG;
             if (!fila.includes(p)) fila.push(p);
           });
    };

    while (!done()) {
      enfileirarChegados();

      let cur: P | null = null;
      let quantum = 1;

      if (filaFG.length) {
        cur = filaFG[0];
        quantum = (fgPol === 'RR') ? fgQ : (cur.restante);
      } else if (filaBG.length) {
        cur = filaBG[0];
        const limiteFG = nextArrivalFG(tempo);
        quantum = (bgPol === 'RR') ? bgQ : cur.restante;
        if (limiteFG < Number.POSITIVE_INFINITY) {
          quantum = Math.min(quantum, Math.max(1, limiteFG - tempo));
        }
      }

      if (!cur) { tempo++; continue; }

      const uso = Math.max(1, Math.min(quantum, cur.restante));
      execs.push({ processoId: cur.id, inicio: tempo, fim: tempo + uso });
      cur.restante -= uso;
      tempo += uso;

      [filaFG, filaBG].forEach(f => {
        if (!f.length) return;
        if (f[0] === cur) f.shift();
        if (cur && cur.restante > 0 && ((cur.classe==='FG' && fgPol==='RR') || (cur.classe==='BG' && bgPol==='RR'))) {
          (cur.classe==='FG' ? filaFG : filaBG).push(cur);
        }
      });

      enfileirarChegados();
    }

    return this.calcularMetricas(base, this.fundirAdjacentes(execs));
  }

  simularRM(
    processos: Processo[],
    cfg: { periodPadrao: number }
  ): ResultadoSimulacao {
    if (!processos?.length) return this.vazio();

    const periodPadrao = Math.max(1, cfg?.periodPadrao ?? 10);
    type P = ProcessoExt & { restante:number; period:number };
    const base = this.copia(processos) as ProcessoExt[];
    const procs: P[] = base.map(p => ({
      ...p,
      restante: p.duracao,
      period: Math.max(1, (p.period ?? periodPadrao))
    }));

    const execs: Execucao[] = [];
    let tempo = Math.min(...procs.map(p=>p.tempoChegada));
    const fim = () => procs.every(p => p.restante <= 0);

    while (!fim()) {
      const ready = procs.filter(p => p.tempoChegada <= tempo && p.restante > 0);
      if (!ready.length) { tempo++; continue; }

      ready.sort((a,b)=> a.period - b.period || a.tempoChegada - b.tempoChegada);
      const cur = ready[0];

      execs.push({ processoId: cur.id, inicio: tempo, fim: tempo + 1 });
      cur.restante -= 1;
      tempo += 1;
    }

    return this.calcularMetricas(base, this.fundirAdjacentes(execs));
  }

  simularDM(
    processos: Processo[],
    cfg: { deadlinePadrao: number }
  ): ResultadoSimulacao {
    if (!processos?.length) return this.vazio();

    const deadlinePadrao = Math.max(1, cfg?.deadlinePadrao ?? 10);
    type P = ProcessoExt & { restante:number; drel:number };
    const base = this.copia(processos) as ProcessoExt[];
    const procs: P[] = base.map(p => ({
      ...p,
      restante: p.duracao,
      drel: Math.max(1, (p.deadline ?? deadlinePadrao))
    }));

    const execs: Execucao[] = [];
    let tempo = Math.min(...procs.map(p=>p.tempoChegada));
    const fim = () => procs.every(p => p.restante <= 0);

    while (!fim()) {
      const ready = procs.filter(p => p.tempoChegada <= tempo && p.restante > 0);
      if (!ready.length) { tempo++; continue; }

      ready.sort((a,b)=> a.drel - b.drel || a.tempoChegada - b.tempoChegada);
      const cur = ready[0];

      execs.push({ processoId: cur.id, inicio: tempo, fim: tempo + 1 });
      cur.restante -= 1;
      tempo += 1;
    }

    return this.calcularMetricas(base, this.fundirAdjacentes(execs));
  }
}
