import { Component, signal, inject, OnInit, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { FormsModule } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatTabsModule } from '@angular/material/tabs';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { NgxChartsModule, Color, ScaleType } from '@swimlane/ngx-charts';
import { EscalonamentoService } from '../escalonamento.service';
import { Processo } from '../models/processo';
import { ResultadoSimulacao } from '../models/resultado-simulacao';

type Algoritmo =
  | 'FCFS' | 'SJF' | 'SRTF' | 'RR' | 'PRIORIDADE'
  | 'MLFQ' | 'LOTTERY' | 'STRIDE' | 'FAIR' | 'CFS';

type ResultadoComparacao = {
  algoritmo: Algoritmo;
  espera: number;
  retorno: number;
  resposta: number;
  justica: number;
};

@Component({
  selector: 'app-simulador-escalonamento',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    MatSlideToggleModule,
    MatToolbarModule,
    MatTabsModule,
    MatDividerModule,
    MatTooltipModule,
    MatProgressBarModule,
    MatButtonToggleModule,
    NgxChartsModule,
  ],
  templateUrl: './simulador-escalonamento.component.html',
  styleUrls: ['./simulador-escalonamento.component.css']
})
export class SimuladorEscalonamentoComponent implements OnInit {
  private fb = inject(FormBuilder);
  mensagemErro: string | null = null;

  @ViewChild('resultTop') resultTop?: ElementRef<HTMLDivElement>;

  listaAlgoritmos: Algoritmo[] = [
    'FCFS','SJF','SRTF','RR','PRIORIDADE',
    'MLFQ','LOTTERY','STRIDE','FAIR','CFS'
  ];

  modo: 'lecture' | 'exploration' = 'lecture';
  tocando = false;
  passoAtual = 0;
  velocidade = 1.0;
  private timer?: any;

  processos = signal<Processo[]>([]);
  colunas = ['id','chegada','duracao','prioridade'];

  mostrarForm = false;

  editingId: string | null = null;
  private originalIdEmEdicao: string | null = null;

  formularioProcesso = this.fb.group({
    id: ['', Validators.required],
    tempoChegada: [0, [Validators.required, Validators.min(0)]],
    duracao: [1, [Validators.required, Validators.min(1)]],
    prioridade: [1]
  });

  formularioConfig = this.fb.group({
    algoritmo: [['FCFS'] as Algoritmo[], Validators.required],
    quantum: [2, [Validators.min(1)]],
    mlfqNiveis: [3, [Validators.min(1)]],
    mlfqQuantumBase: [2, [Validators.min(1)]],
    mlfqBoost: [50, [Validators.min(1)]],
    lotteryTicketsPadrao: [100, [Validators.min(1)]],
    strideTicketsPadrao: [100, [Validators.min(1)]],
    fairSharePadrao: [1, [Validators.min(1)]],
    cfsNicePadrao: [0],
    preview: [false]
  });

  get algoritmosSelecionados(): Algoritmo[] {
    return (this.formularioConfig.value.algoritmo || []) as Algoritmo[];
  }
  get jaSimulou(): boolean { return !!this.resultado || this.comparacao.length > 0; }
  get temResultados(): boolean { return this.jaSimulou; }

  get isComparacaoAtiva(): boolean {
    return !this.resultado && this.comparacao.length > 0;
  }

  resultado?: ResultadoSimulacao;
  dadosGantt: any[] = [];
  comparacao: ResultadoComparacao[] = [];

  dadosComparacao = {
    espera: [] as { name: string; value: number }[],
    retorno: [] as { name: string; value: number }[],
    resposta: [] as { name: string; value: number }[],
    justica: [] as { name: string; value: number }[],
  };

  chartSelecionado: 'espera' | 'retorno' | 'resposta' | 'justica' = 'retorno';

  private resultadoConfirmado?: ResultadoSimulacao;
  private comparacaoConfirmada: ResultadoComparacao[] = [];
  private dadosGanttConfirmado: any[] = [];

  resultadosMulti: Partial<Record<Algoritmo, ResultadoSimulacao>> = {};
  ganttMulti: Partial<Record<Algoritmo, any[]>> = {};
  coresGanttMulti: Partial<Record<Algoritmo, Array<{ name: string; value: string }>>> = {};
  paletaProcessos: Record<string, string> = {};
  private palette = ['#5AA454','#A10A28','#C7B42C','#7AA3E5','#1f77b4','#ff7f0e','#2ca02c','#d62728','#9467bd','#8c564b','#e377c2','#7f7f7f','#bcbd22','#17becf'];
  private idleColor = '#cbd5e1';
  highlightColor = '#ff9800';

  colorScheme: Color = {
    name: 'custom',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#5AA454', '#A10A28', '#C7B42C', '#7AA3E5', '#AAAAAA']
  };

  private calcAltura(nSeries: number): number {
    const h = 60 + nSeries * 28;
    return Math.max(140, Math.min(h, 320));
  }
  get ganttWidth(): number { return 820; }
  get ganttHeightSingle(): number {
    const n = this.resultado?.execucoes?.length ?? 1;
    return this.calcAltura(n);
  }
  ganttHeightMulti(algo: Algoritmo): number {
    const n = this.resultadosMulti[algo]?.execucoes?.length ?? 1;
    return this.calcAltura(n);
  }

  actionDockOpen = true;
  toggleActionDock() { this.actionDockOpen = !this.actionDockOpen; }
  get canAdd(): boolean { return !this.editingId && this.formularioProcesso.valid; }
  get canSave(): boolean { return !!this.editingId && this.formularioProcesso.valid; }
  get doisProcessos(): boolean { return this.processos().length === 2; }

  constructor(private svc: EscalonamentoService) {}

ngOnInit(): void {
  this.formularioProcesso.valueChanges.subscribe(() => {
    this.limparMensagem();
    if (this.editingId && this.jaSimulou && this.formularioConfig.value.preview) {
      this.atualizarPreviewEdicao();
    }
  });


  this.formularioConfig.controls.quantum.valueChanges?.subscribe(() => {
    if (!this.jaSimulou) return;
    if (!this.algoritmosSelecionados.includes('RR')) return;
    if (this.editingId && this.formularioConfig.value.preview) this.atualizarPreviewEdicao();
    else this.simular();
  });
}

  setModo(m: 'lecture' | 'exploration') {
    this.modo = m;
    if (m === 'exploration' && !this.processos().length && !this.temResultados) {
      this.mostrarForm = true;
    }
  }

onToggleAlgoritmo(algo: Algoritmo, ev: Event) {
  const checked = (ev.target as HTMLInputElement).checked;

  const atual = [...this.algoritmosSelecionados];

  const novo = checked
    ? (atual.includes(algo) ? atual : [...atual, algo])
    : atual.filter(a => a !== algo);

  this.formularioConfig.controls.algoritmo.setValue(novo as Algoritmo[], { emitEvent: false });

  if (this.jaSimulou) {
    if (this.editingId && this.formularioConfig.value.preview) {
      this.atualizarPreviewEdicao();
    } else {
      this.simular();
    }
  }
}
  get totalPassos(): number { return this.resultado?.execucoes?.length ?? 0; }
  tocar() {
    if (!this.resultado || !this.totalPassos) return;
    this.tocando = true;
    const passoMs = Math.max(200, 600 / this.velocidade);
    this.timer = setInterval(() => {
      this.proximoPasso();
      if (this.passoAtual >= this.totalPassos - 1) this.pausar();
    }, passoMs);
  }
  pausar() { this.tocando = false; if (this.timer) clearInterval(this.timer); }
  inicio() { this.passoAtual = 0; }
  fim() { if (this.totalPassos) this.passoAtual = this.totalPassos - 1; }
  proximoPasso() { if (this.totalPassos) this.passoAtual = Math.min(this.passoAtual + 1, this.totalPassos - 1); }
  passoAnterior() { if (this.totalPassos) this.passoAtual = Math.max(this.passoAtual - 1, 0); }
  setVelocidade(v: number) { this.velocidade = v; if (this.tocando) { this.pausar(); this.tocar(); } }

  limparMensagem() { this.mensagemErro = null; }

  adicionarDock() {
    if (!this.mostrarForm) {
      this.mostrarForm = true;
      this.editingId = null;
      this.originalIdEmEdicao = null;
      this.formularioProcesso.reset({ id: '', tempoChegada: 0, duracao: 1, prioridade: 1 });
      return;
    }
    if (!this.editingId) this.adicionar();
  }

  adicionar() {
    if (this.formularioProcesso.invalid) return;
    const raw = this.formularioProcesso.getRawValue();
    const p: Processo = {
      id: String(raw.id).trim(),
      tempoChegada: Number(raw.tempoChegada),
      duracao: Number(raw.duracao),
      prioridade: raw.prioridade != null ? Number(raw.prioridade) : undefined
    };
    if (!p.id) return;
    if (this.processos().some(x => x.id === p.id)) {
      this.mensagemErro = '⚠️ ID já existe.';
      return;
    }
    this.processos.update(arr => [...arr, p]);
    this.formularioProcesso.reset({ id: '', tempoChegada: 0, duracao: 1, prioridade: 1 });
    this.limparMensagem();
  }

  editar(p: Processo) {
    this.mostrarForm = true;
    this.formularioProcesso.setValue({
      id: p.id,
      tempoChegada: p.tempoChegada,
      duracao: p.duracao,
      prioridade: p.prioridade ?? 1
    });
    this.editingId = p.id;
    this.originalIdEmEdicao = p.id;
    this.limparMensagem();
  }

  salvarEdicao() {
    if (this.formularioProcesso.invalid || !this.originalIdEmEdicao) return;
    const raw = this.formularioProcesso.getRawValue();
    const atualizado: Processo = {
      id: String(raw.id).trim(),
      tempoChegada: Number(raw.tempoChegada),
      duracao: Number(raw.duracao),
      prioridade: raw.prioridade != null ? Number(raw.prioridade) : undefined
    };
    if (!atualizado.id) return;

    const conflita = this.processos().some(x => x.id === atualizado.id && x.id !== this.originalIdEmEdicao);
    if (conflita) { this.mensagemErro = '⚠️ Já existe um processo com esse ID.'; return; }

    this.processos.update(arr => arr.map(p => p.id === this.originalIdEmEdicao ? atualizado : p));
    this.cancelarEdicao();
    if (this.jaSimulou) this.simular();
  }

  cancelarEdicao() {
    this.editingId = null;
    this.originalIdEmEdicao = null;
    this.formularioProcesso.reset({ id: '', tempoChegada: 0, duracao: 1, prioridade: 1 });
    this.mostrarForm = false;
    this.limparMensagem();
    if (this.jaSimulou && this.formularioConfig.value.preview) {
      this.formularioConfig.controls.preview.setValue(false, { emitEvent: true });
    }
  }

  remover(id: string) {
    if (this.editingId === id) this.cancelarEdicao();
    this.processos.update(arr => arr.filter(p => p.id !== id));
    if (this.processos().length) this.limparMensagem();
    if (this.jaSimulou) this.simular();
  }

  preencherExemplo() {
    this.processos.set([
      { id: 'P1', tempoChegada: 0, duracao: 8, prioridade: 2 },
      { id: 'P2', tempoChegada: 1, duracao: 4, prioridade: 1 },
      { id: 'P3', tempoChegada: 2, duracao: 9, prioridade: 3 },
      { id: 'P4', tempoChegada: 3, duracao: 5, prioridade: 2 },
    ]);
    this.resultado = undefined;
    this.dadosGantt = [];
    this.metricasDetalhadas = [];
    this.comparacao = [];
    this.dadosComparacao = { espera: [], retorno: [], resposta: [], justica: [] };
    this.mensagemErro = null;
    this.mostrarForm = false;
    this.cancelarEdicao();
  }

  limpar() {
    this.processos.set([]);
    this.resultado = undefined;
    this.dadosGantt = [];
    this.metricasDetalhadas = [];
    this.comparacao = [];
    this.dadosComparacao = { espera: [], retorno: [], resposta: [], justica: [] };
    this.mensagemErro = null;
    this.mostrarForm = false;
    this.cancelarEdicao();
    this.resultadoConfirmado = undefined;
    this.comparacaoConfirmada = [];
    this.dadosGanttConfirmado = [];
    this.resultadosMulti = {};
    this.ganttMulti = {};
    this.coresGanttMulti = {};
    this.paletaProcessos = {};
    this.kpisResumo = undefined;
  }

  private rolarParaResultados() {
    setTimeout(() => {
      if (this.resultTop?.nativeElement) {
        this.resultTop.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  simular() {
    this.mostrarForm = false;

    const base = this.processos();
    if (!base.length) {
      this.mensagemErro = '⚠️ Adicione pelo menos 1 processo para simular.';
      this.resultado = undefined;
      this.dadosGantt = [];
      this.metricasDetalhadas = [];
      this.comparacao = [];
      this.dadosComparacao = { espera: [], retorno: [], resposta: [], justica: [] };
      this.kpisResumo = undefined;
      return;
    }

    let selecionados = Array.from(new Set(this.algoritmosSelecionados));
    if (!selecionados.length) {
      selecionados = ['FCFS'];
      this.formularioConfig.controls.algoritmo.setValue(selecionados as Algoritmo[], { emitEvent: false });
    }

    this.construirPaletaProcessos(base);

    this.mensagemErro = null;
    this.comparacao = [];
    this.dadosComparacao = { espera: [], retorno: [], resposta: [], justica: [] };

    this.resultadosMulti = {};
    this.ganttMulti = {};
    this.coresGanttMulti = {};

    const q = Number(this.formularioConfig.value.quantum ?? 2);

    const opts = {
      mlfq: {
        niveis: Number(this.formularioConfig.value.mlfqNiveis ?? 3),
        quantumBase: Number(this.formularioConfig.value.mlfqQuantumBase ?? 2),
        boost: Number(this.formularioConfig.value.mlfqBoost ?? 50),
      },
      lottery: { ticketsPadrao: Number(this.formularioConfig.value.lotteryTicketsPadrao ?? 100) },
      stride:  { ticketsPadrao: Number(this.formularioConfig.value.strideTicketsPadrao ?? 100) },
      fair:    { sharePadrao:  Number(this.formularioConfig.value.fairSharePadrao ?? 1) },
      cfs:     { nicePadrao:   Number(this.formularioConfig.value.cfsNicePadrao ?? 0) }
    };

    if (selecionados.length === 1) {
      const algo = selecionados[0];
      const listaCopia: Processo[] = base.map(p => ({ ...p }));
      try {
        this.resultado = this.executarAlgoritmo(algo, listaCopia, q, opts);
        const pack = this.montarGanttComCores(this.resultado!.execucoes);
        this.dadosGantt = pack.dados;
        this.calcularMetricasPorProcesso();
        this.calcularKpisResumo(listaCopia, this.resultado!.execucoes);
        this.resultadoConfirmado = JSON.parse(JSON.stringify(this.resultado));
        this.comparacaoConfirmada = [];
        this.dadosGanttConfirmado = JSON.parse(JSON.stringify(this.dadosGantt));
      } catch (e) {
        console.error(`[${algo}] falhou`, e);
        this.resultado = undefined;
        this.dadosGantt = [];
        this.metricasDetalhadas = [];
        this.kpisResumo = undefined;
        this.mensagemErro = `Falha ao simular ${algo}.`;
      }
      this.rolarParaResultados();
      return;
    }

    this.resultado = undefined;
    this.dadosGantt = [];
    this.metricasDetalhadas = [];
    this.kpisResumo = undefined;

    for (const algo of selecionados) {
      const listaCopia: Processo[] = base.map(p => ({ ...p }));
      try {
        const r = this.executarAlgoritmo(algo, listaCopia, q, opts);
        const justica = this.calcularJusticaPorEspera(r, listaCopia);

        this.resultadosMulti[algo] = r;
        const { dados, custom } = this.montarGanttComCores(r.execucoes);
        this.ganttMulti[algo] = dados;
        this.coresGanttMulti[algo] = custom;

        this.comparacao.push({
          algoritmo: algo,
          espera: r.tempoMedioEspera,
          retorno: r.tempoMedioRetorno,
          resposta: r.tempoMedioResposta,
          justica
        });
      } catch (e) {
        console.error(`[${algo}] falhou`, e);
        this.comparacao.push({ algoritmo: algo, espera: NaN, retorno: NaN, resposta: NaN, justica: NaN });
      }
    }
    this.atualizarGraficosComparacao();

    this.resultadoConfirmado = undefined;
    this.comparacaoConfirmada = this.comparacao.map(c => ({ ...c }));
    this.dadosGanttConfirmado = [];
    this.rolarParaResultados();
  }

  private atualizarPreviewEdicao() {
    if (!this.originalIdEmEdicao) return;

    const raw = this.formularioProcesso.getRawValue();
    const atualizado: Processo = {
      id: String(raw.id).trim(),
      tempoChegada: Number(raw.tempoChegada),
      duracao: Number(raw.duracao),
      prioridade: raw.prioridade != null ? Number(raw.prioridade) : undefined
    };

    const listaPreview = this.processos().map(p =>
      p.id === this.originalIdEmEdicao ? atualizado : p
    );

    const selecionados = Array.from(new Set(this.algoritmosSelecionados));
    const q = Number(this.formularioConfig.value.quantum ?? 2);

    const opts = {
      mlfq: { niveis: Number(this.formularioConfig.value.mlfqNiveis ?? 3),
              quantumBase: Number(this.formularioConfig.value.mlfqQuantumBase ?? 2),
              boost: Number(this.formularioConfig.value.mlfqBoost ?? 50) },
      lottery: { ticketsPadrao: Number(this.formularioConfig.value.lotteryTicketsPadrao ?? 100) },
      stride:  { ticketsPadrao: Number(this.formularioConfig.value.strideTicketsPadrao ?? 100) },
      fair:    { sharePadrao:  Number(this.formularioConfig.value.fairSharePadrao ?? 1) },
      cfs:     { nicePadrao:   Number(this.formularioConfig.value.cfsNicePadrao ?? 0) }
    };

    this.construirPaletaProcessos(listaPreview);

    if (selecionados.length === 1) {
      const algo = selecionados[0];
      const r = this.executarAlgoritmo(algo, listaPreview.map(p => ({ ...p })), q, opts);
      this.resultado = r;
      const pack = this.montarGanttComCores(r.execucoes);
      this.dadosGantt = pack.dados;
      this.calcularMetricasPorProcesso();
      this.calcularKpisResumo(listaPreview, r.execucoes);
    } else {
      this.resultado = undefined;
      this.dadosGantt = [];
      this.metricasDetalhadas = [];
      this.comparacao = [];
      this.resultadosMulti = {};
      this.ganttMulti = {};
      this.coresGanttMulti = {};
      this.kpisResumo = undefined;

      for (const algo of selecionados) {
        const r = this.executarAlgoritmo(algo, listaPreview.map(p => ({ ...p })), q, opts);
        const justica = this.calcularJusticaPorEspera(r, listaPreview);
        this.comparacao.push({
          algoritmo: algo,
          espera: r.tempoMedioEspera,
          retorno: r.tempoMedioRetorno,
          resposta: r.tempoMedioResposta,
          justica
        });

        const { dados, custom } = this.montarGanttComCores(r.execucoes);
        this.resultadosMulti[algo] = r;
        this.ganttMulti[algo] = dados;
        this.coresGanttMulti[algo] = custom;
      }
      this.atualizarGraficosComparacao();
    }
  }

  private atualizarGraficosComparacao() {
    const make = (campo: keyof ResultadoComparacao) =>
      this.comparacao.map(c => ({ name: c.algoritmo, value: (c as any)[campo] as number }));
    this.dadosComparacao.espera   = make('espera');
    this.dadosComparacao.retorno  = make('retorno');
    this.dadosComparacao.resposta = make('resposta');
    this.dadosComparacao.justica  = make('justica');
  }

  private executarAlgoritmo(algo: Algoritmo, lista: Processo[], quantum: number, opts: any): ResultadoSimulacao {
    switch (algo) {
      case 'FCFS':       return this.svc.simularFCFS(lista);
      case 'SJF':        return this.svc.simularSJF(lista);
      case 'SRTF':       return this.svc.simularSRTF(lista);
      case 'RR':         return this.svc.simularRR(lista, quantum);
      case 'PRIORIDADE': return this.svc.simularPrioridade(lista);
      case 'MLFQ':       return this.svc.simularMLFQ(lista, opts.mlfq);
      case 'LOTTERY':    return this.svc.simularLottery(lista, opts.lottery);
      case 'STRIDE':     return this.svc.simularStride(lista, opts.stride);
      case 'FAIR':       return this.svc.simularFairShare(lista, opts.fair);
      case 'CFS':        return this.svc.simularCFS(lista, opts.cfs);
    }
  }

  private jain(valores: number[]): number {
    if (!valores.length) return 0;
    const soma = valores.reduce((a,b)=>a+b,0);
    const soma2 = valores.reduce((a,b)=>a+b*b,0);
    return soma === 0 ? 0 : +((soma*soma) / (valores.length * soma2)).toFixed(3);
  }

  private calcularJusticaPorEspera(exec: ResultadoSimulacao, lista: Processo[]): number {
    const mapa = new Map<string, { primeiro: number; fim: number; exec: number; chegada: number }>();
    for (const p of lista) mapa.set(p.id, { primeiro: Number.POSITIVE_INFINITY, fim: 0, exec: 0, chegada: p.tempoChegada });
    for (const e of exec.execucoes) {
      const m = mapa.get(e.processoId)!;
      m.primeiro = Math.min(m.primeiro, e.inicio);
      m.fim = Math.max(m.fim, e.fim);
      m.exec += (e.fim - e.inicio);
    }
    const esperas = [...mapa.values()].map(m => (m.fim - m.chegada) - m.exec);
    const equidade = esperas.map(w => 1 / (w + 1));
    return this.jain(equidade);
  }

  private montarGanttComCores(execs: { processoId: string; inicio: number; fim: number }[]) {
    const ordenado = [...execs].sort((a,b)=> a.inicio - b.inicio);
    const preenchido: { processoId: string; inicio: number; fim: number }[] = [];
    let cursor = 0;

    for (const e of ordenado) {
      if (e.inicio > cursor) preenchido.push({ processoId: 'IDLE', inicio: cursor, fim: e.inicio });
      preenchido.push(e);
      cursor = Math.max(cursor, e.fim);
    }

    const series = preenchido.map(e => ({
      name: `${e.processoId} (${e.inicio}-${e.fim})`,
      value: Math.max(0, e.fim - e.inicio),
      extra: e
    }));
    const dados = [{ name: 'CPU', series }];

    const custom = preenchido.map(e => ({
      name: `${e.processoId} (${e.inicio}-${e.fim})`,
      value: this.paletaProcessos[e.processoId] || '#888'
    }));
    return { dados, custom };
  }

  metricasDetalhadas: { id: string; espera: number; retorno: number; resposta: number }[] = [];

  private calcularMetricasPorProcesso() {
    if (!this.resultado) { this.metricasDetalhadas = []; return; }
    const mapa = new Map<string, { primeiroInicio: number; conclusao: number; totalExec: number; chegada: number }>();
    for (const p of this.processos()) {
      mapa.set(p.id, { primeiroInicio: Number.POSITIVE_INFINITY, conclusao: 0, totalExec: 0, chegada: p.tempoChegada });
    }
    for (const e of this.resultado.execucoes) {
      const m = mapa.get(e.processoId)!;
      m.primeiroInicio = Math.min(m.primeiroInicio, e.inicio);
      m.conclusao = Math.max(m.conclusao, e.fim);
      m.totalExec += (e.fim - e.inicio);
    }
    this.metricasDetalhadas = Array.from(mapa.entries()).map(([id, m]) => {
      const primeiro = isFinite(m.primeiroInicio) ? m.primeiroInicio : m.chegada;
      const retorno  = m.conclusao - m.chegada;
      const espera   = retorno - m.totalExec;
      const resposta = primeiro - m.chegada;
      return { id, espera, retorno, resposta };
    });
  }

  kpisResumo?: {
    makespan: number;
    totalExec: number;
    ociosidade: number;
    utilizacaoCpu: number;
    throughput: number;
    ctxSwitches: number;
  };

  private calcularKpisResumo(lista: Processo[], execs: { processoId: string; inicio: number; fim: number }[]) {
    if (!execs.length) { this.kpisResumo = undefined; return; }

    const chegadaMin = Math.min(...lista.map(p => p.tempoChegada));
    const fimMax = Math.max(...execs.map(e => e.fim));
    const inicioMinExec = Math.min(...execs.map(e => e.inicio));
    const totalExec = execs.reduce((s, e) => s + (e.fim - e.inicio), 0);
    const makespan = fimMax - Math.min(chegadaMin, inicioMinExec);
    const ociosidade = Math.max(0, makespan - totalExec);
    const utilizacao = makespan > 0 ? totalExec / makespan : 0;
    const throughput = makespan > 0 ? lista.length / makespan : lista.length;

    let ctxSwitches = 0;
    for (let i = 1; i < execs.length; i++) {
      if (execs[i].processoId !== execs[i - 1].processoId) ctxSwitches++;
    }

    this.kpisResumo = {
      makespan,
      totalExec,
      ociosidade,
      utilizacaoCpu: +utilizacao.toFixed(3),
      throughput: +throughput.toFixed(3),
      ctxSwitches
    };
  }

  private construirPaletaProcessos(processos: Processo[]) {
    const todos = [...new Set(processos.map(p => p.id))].sort();
    const map: Record<string, string> = {};
    todos.forEach((id, i) => map[id] = this.palette[i % this.palette.length]);
    map['IDLE'] = this.idleColor;
    this.paletaProcessos = map;
  }

  get highlightedName(): string | null {
    const e = this.resultado?.execucoes?.[this.passoAtual];
    return e ? `${e.processoId} (${e.inicio}-${e.fim})` : null;
  }

  get coresGanttUnico(): Array<{ name: string; value: string }> {
    if (!this.resultado?.execucoes) return [];
    const ordenado = [...this.resultado.execucoes].sort((a,b)=> a.inicio - b.inicio);
    const cores: Array<{ name: string; value: string }> = [];
    let cursor = 0;
    for (const e of ordenado) {
      if (e.inicio > cursor) {
        const nomeIdle = `IDLE (${cursor}-${e.inicio})`;
        cores.push({ name: nomeIdle, value: this.paletaProcessos['IDLE'] || this.idleColor });
      }
      const nome = `${e.processoId} (${e.inicio}-${e.fim})`;
      cores.push({ name: nome, value: this.paletaProcessos[e.processoId] || '#888' });
      cursor = Math.max(cursor, e.fim);
    }
    const h = this.highlightedName;
    return h ? cores.map(c => c.name === h ? { name: c.name, value: this.highlightColor } : c) : cores;
  }

  get coresPersonalizadas(): Array<{ name: string; value: string }> {
    return this.coresGanttUnico;
  }

  getJustica(algo: Algoritmo): number {
    const item = this.comparacao.find(c => c.algoritmo === algo);
    return item ? item.justica : NaN;
  }

  private pickCandidato(): Processo | null {
    const arr = this.processos();
    if (!arr.length) return null;
    return [...arr].sort(
      (a, b) => a.tempoChegada - b.tempoChegada || a.id.localeCompare(b.id)
    )[0];
  }

  editarDock() {
    const arr = this.processos();
    if (!arr.length) return;

    if (!this.editingId) {
      const alvo = this.pickCandidato();
      if (alvo) this.editar(alvo);
    } else {
      if (this.formularioProcesso.valid) this.salvarEdicao();
      else this.cancelarEdicao();
    }
  }

  removerDock() {
    const arr = this.processos();
    if (!arr.length) return;
    if (this.editingId) {
      this.remover(this.editingId);
      return;
    }
    const alvo = this.pickCandidato();
    if (alvo) this.remover(alvo.id);
  }
}
