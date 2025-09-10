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
import { RouterModule, ActivatedRoute, Router, NavigationEnd } from '@angular/router';
import { EscalonamentoService } from '../escalonamento.service';
import { Processo } from '../models/processo';
import { ResultadoSimulacao } from '../models/resultado-simulacao';
import { filter } from 'rxjs/operators';
import { MatMenuModule } from '@angular/material/menu';

type Algoritmo =
  | 'FCFS' | 'SJF' | 'SRTF' | 'RR' | 'PRIORIDADE'
  | 'MLFQ' | 'LOTTERY' | 'STRIDE' | 'FAIR' | 'CFS'
  | 'HRRN' | 'PRIORIDADE_AGING' | 'MLQ' | 'RM' | 'DM';

type ResultadoComparacao = {
  algoritmo: Algoritmo;
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
};

type ChartTipo =
  | 'espera' | 'retorno' | 'resposta' | 'justica'
  | 'makespan' | 'utilizacao' | 'ociosidade' | 'throughput' | 'ctxSwitches'
  | 'slowdownMedio' | 'slowdownMax'
  | 'dpEspera' | 'dpRetorno' | 'dpResposta';

@Component({
  selector: 'app-simulador-escalonamento',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, FormsModule,
    MatFormFieldModule, MatInputModule, MatButtonModule, MatSelectModule,
    MatIconModule, MatTableModule, MatChipsModule, MatSlideToggleModule,
    MatToolbarModule, MatTabsModule, MatDividerModule, MatTooltipModule,
    MatProgressBarModule, MatButtonToggleModule, NgxChartsModule,
    RouterModule, MatMenuModule
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
    'MLFQ','LOTTERY','STRIDE','FAIR','CFS',
    'HRRN','PRIORIDADE_AGING','MLQ','RM','DM'
  ];

  modo: 'lecture' | 'exploration' = 'lecture';
  page: 'home' | 'add' | 'edit' | 'simulate' | 'remove' = 'home';

  private _runFlag = false;
  get showChartQuickSelect(): boolean {
    return this.modo === 'exploration' && this.page === 'simulate' && this._runFlag;
  }

  chartLabel: Record<ChartTipo, string> = {
    espera: 'Espera média',
    retorno: 'Retorno médio',
    resposta: 'Resposta média',
    justica: 'Justiça (Jain)',
    makespan: 'Makespan',
    utilizacao: 'Utilização da CPU',
    ociosidade: 'Ociosidade',
    throughput: 'Throughput',
    ctxSwitches: 'Trocas de contexto',
    slowdownMedio: 'Slowdown médio',
    slowdownMax: 'Slowdown máximo',
    dpEspera: 'DP (espera)',
    dpRetorno: 'DP (retorno)',
    dpResposta: 'DP (resposta)',
  };

  chartResults: { name: string; value: number }[] = [];
  chartSelecionado: ChartTipo = 'retorno';

  tocando = false;
  passoAtual = 0;
  velocidade = 1.0;
  private timer?: any;

  processos = signal<Processo[]>([]);
  colunas = ['id','chegada','duracao','prioridade'];

  mostrarForm = false;

  editingId: string | null = null;
  private originalIdEmEdicao: string | null = null;

  abaDireitaIndex = 0;
  selecaoModo: 'editar' | 'remover' | null = null;

  private ultimaSelecaoAlgoritmos: Algoritmo[] = [];

  preferirConfig = false;

  formularioProcesso = this.fb.group({
    id: ['', Validators.required],
    tempoChegada: [0, [Validators.required, Validators.min(0)]],
    duracao: [1, [Validators.required, Validators.min(1)]],
    prioridade: [1, [Validators.min(1)]],

    tickets: [null as number | null],
    grupo: ['' as string],
    share: [null as number | null],
    nice: [null as number | null],
    mlqFilaInicial: [null as ('FG'|'BG'|number|null)],
    mlfqNivelInicial: [null as number | null],
    periodo: [null as number | null],
    deadline: [null as number | null],
  });

  formularioConfig = this.fb.group({
    algoritmo: [[] as Algoritmo[]],

    quantum: [2, [Validators.min(1)]],
    mlfqNiveis: [3, [Validators.min(1)]],
    mlfqQuantumBase: [2, [Validators.min(1)]],
    mlfqBoost: [50, [Validators.min(1)]],
    lotteryTicketsPadrao: [100, [Validators.min(1)]],
    strideTicketsPadrao: [100, [Validators.min(1)]],
    fairSharePadrao: [1, [Validators.min(1)]],
    cfsNicePadrao: [0],
    preview: [false],

    agingRate: [0.1],
    mlqPoliticaFG: ['RR'],
    mlqQuantumFG: [2, [Validators.min(1)]],
    mlqPoliticaBG: ['FCFS'],
    mlqQuantumBG: [4, [Validators.min(1)]],
    rmPeriodPadrao: [10, [Validators.min(1)]],
    dmDeadlinePadrao: [10, [Validators.min(1)]],
  });

  get algoritmosSelecionados(): Algoritmo[] {
    return (this.formularioConfig.value.algoritmo || []) as Algoritmo[];
  }
  get showTickets() { return this.algoritmosSelecionados.some(a => a==='LOTTERY' || a==='STRIDE'); }
  get showGrupo()   { return this.algoritmosSelecionados.some(a => a==='FAIR' || a==='CFS'); }
  get showShare()   { return this.algoritmosSelecionados.includes('FAIR'); }
  get showNice()    { return this.algoritmosSelecionados.includes('CFS'); }
  get showMLQ()     { return this.algoritmosSelecionados.includes('MLQ'); }
  get showMLFQ()    { return this.algoritmosSelecionados.includes('MLFQ'); }
  get showRM()      { return this.algoritmosSelecionados.includes('RM'); }
  get showDM()      { return this.algoritmosSelecionados.includes('DM'); }

  get jaSimulou(): boolean { return !!this.resultado || this.comparacao.length > 0; }
  get temResultados(): boolean { return this.jaSimulou; }
  get isComparacaoAtiva(): boolean {
    const podeMostrar = this.page === 'home' || this.page === 'simulate';
    return podeMostrar && !this.resultado && this.comparacao.length > 0;
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

  constructor(
    private svc: EscalonamentoService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  private numOrU(v: any) { return v === null || v === '' || v === undefined ? undefined : Number(v); }
  private strOrU(v: any) { return v === null || v === '' ? undefined : String(v); }

  private persistProcessos() {
    try { localStorage.setItem('sim.processos', JSON.stringify(this.processos())); } catch {}
  }
  private persistAlgoritmos() {
    try { localStorage.setItem('sim.algoritmos', JSON.stringify(this.algoritmosSelecionados)); } catch {}
  }
  private hydrateFromStorage() {
    try {
      const rawP = localStorage.getItem('sim.processos');
      if (rawP) this.processos.set(JSON.parse(rawP));

      const rawA = localStorage.getItem('sim.algoritmos');
      if (rawA) {
        const algos = JSON.parse(rawA) as Algoritmo[];
        this.formularioConfig.controls.algoritmo.setValue(algos as any, { emitEvent: false });
        this.ultimaSelecaoAlgoritmos = [...algos];
      }
    } catch {}
  }

  private syncPageFromUrl(url: string) {
    if (url.startsWith('/aula')) {
      this.modo = 'lecture';
      this.page = 'home';
      return;
    }
    this.modo = 'exploration';
    if (url.startsWith('/adicionar')) this.page = 'add';
    else if (url.startsWith('/editar')) this.page = 'edit';
    else if (url.startsWith('/remover')) this.page = 'remove';
    else if (url.startsWith('/simular')) this.page = 'simulate';
    else this.page = 'home';
  }

  ngOnInit(): void {
    this.hydrateFromStorage();

    this.route.data.subscribe(d => {
      this.modo = (d?.['mode'] as any) || this.modo;
      this.page = (d?.['page'] as any) || this.page;

      if (this.modo !== 'exploration') return;

      if (this.page === 'add') this.entrarEmAdicionar();
      else if (this.page === 'edit') this.entrarEmEditar();
      else if (this.page === 'remove') this.entrarEmRemover();
      else if (this.page === 'simulate') {
        this.preferirConfig = false;
        this.mostrarForm = false;
        this.selecaoModo = null;
        this.abaDireitaIndex = 0;
        this.editingId = null;
        this.originalIdEmEdicao = null;
      } else {
        this.selecaoModo = null;
        this.abaDireitaIndex = 0;
        this.mostrarForm = !this.temResultados && !this.processos().length;
      }
    });

    this.syncPageFromUrl(this.router.url);
    this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(e => this.syncPageFromUrl(e.urlAfterRedirects));

    this.route.queryParamMap.subscribe(params => {
      this._runFlag = params.get('run') === '1';
      if (this._runFlag) {
        Promise.resolve().then(() => this.simular());
      }
    });

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

    this.formularioConfig.controls.algoritmo.valueChanges?.subscribe(() => this.syncExtraFields());
    this.syncExtraFields();

    this.updateChartResultsFromSelection();
  }

  private syncExtraFields() {
    const f = this.formularioProcesso.controls;
    const set = (ctl: any, enabled: boolean, validators: any[] = []) => {
      if (enabled) {
        ctl.enable({ emitEvent:false });
        ctl.setValidators(validators);
      } else {
        ctl.reset(null, { emitEvent:false });
        ctl.disable({ emitEvent:false });
        ctl.clearValidators();
      }
      ctl.updateValueAndValidity({ emitEvent:false });
    };

    set(f['tickets'], this.showTickets, [Validators.min(1)]);
    set(f['grupo'],   this.showGrupo);
    set(f['share'],   this.showShare, [Validators.min(1)]);
    set(f['nice'],    this.showNice );
    set(f['mlqFilaInicial'], this.showMLQ);
    set(f['mlfqNivelInicial'], this.showMLFQ, [Validators.min(0)]);
    set(f['periodo'],  this.showRM, [Validators.min(1)]);
    set(f['deadline'], this.showDM, [Validators.min(1)]);
  }

  private entrarEmAdicionar() {
    this.preferirConfig = true;
    this.mostrarForm = true;
    this.selecaoModo = null;
    this.abaDireitaIndex = 0;

    this.resultado = undefined;
    this.dadosGantt = [];
    this.metricasDetalhadas = [];
    this.comparacao = [];
    this.dadosComparacao = { espera: [], retorno: [], resposta: [], justica: [] };
    this.resultadosMulti = {};
    this.ganttMulti = {};
    this.coresGanttMulti = {};

    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }

  private entrarEmEditar() {
    this.preferirConfig = true;
    this.mostrarForm = false;
    this.selecaoModo = 'editar';
    this.abaDireitaIndex = 1;
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }

  onAbaDireitaChange(idx: number) { this.abaDireitaIndex = idx; }
  abrirSelecao(modo: 'editar' | 'remover') { this.selecaoModo = modo; this.abaDireitaIndex = 1; }

  async voltarParaSimulacao() {
    this.limparMensagem();

    this.selecaoModo = null;
    this.abaDireitaIndex = 0;
    this.mostrarForm = false;
    this.editingId = null;
    this.originalIdEmEdicao = null;

    if (!this.processos().length) {
      this.mensagemErro = '⚠️ Adicione pelo menos 1 processo para simular.';
      await this.router.navigate(['/adicionar']);
      return;
    }
    this.ensureAlgoritmosSelecionados();

    await this.router.navigate(
      ['/simular'],
      { queryParams: { run: '1', t: Date.now() }, queryParamsHandling: 'merge' }
    );

    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }

  setModo(m: 'lecture' | 'exploration') {
    this.router.navigate([m === 'lecture' ? '/aula' : '/simular']);
  }

  onToggleAlgoritmo(algo: Algoritmo, ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    const atual = [...this.algoritmosSelecionados];
    const novo = checked ? (atual.includes(algo) ? atual : [...atual, algo]) : atual.filter(a => a !== algo);

    this.formularioConfig.controls.algoritmo.setValue(novo as Algoritmo[], { emitEvent: false });
    this.ultimaSelecaoAlgoritmos = [...(novo as Algoritmo[])];
    this.persistAlgoritmos();

    this.syncExtraFields();

    if (this.jaSimulou) {
      if (this.editingId && this.formularioConfig.value.preview) this.atualizarPreviewEdicao();
      else this.simular();
    }
  }

  get totalPassos(): number { return this.resultado?.execucoes?.length ?? 0; }
  tocar() {
    if (!this.resultado || !this.totalPassos) return;
    const passoMs = Math.max(200, 600 / this.velocidade);
    this.tocando = true;
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

  private irParaNovoProcesso(): void {
    this.page = 'add';
    this.selecaoModo = null;
    this.abaDireitaIndex = 0;
    this.mostrarForm = true;
    this.editingId = null;
    this.originalIdEmEdicao = null;
    this.preferirConfig = true;

    this.formularioProcesso.reset({
      id: '',
      tempoChegada: 0,
      duracao: 1,
      prioridade: 1,
      tickets: null, grupo: '', share: null, nice: null,
      mlqFilaInicial: null, mlfqNivelInicial: null, periodo: null, deadline: null
    });

    this.syncExtraFields();
    this.limparMensagem();
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }

  adicionarDock() {
    this.limparMensagem();

    if (this.modo === 'exploration' && this.page === 'add') {
      this.adicionar();
      return;
    }

    this.editingId = null;
    this.originalIdEmEdicao = null;

    this.mostrarForm = true;
    this.preferirConfig = true;
    this.selecaoModo = null;
    this.abaDireitaIndex = 0;

    this.formularioProcesso.reset({
      id: '',
      tempoChegada: 0,
      duracao: 1,
      prioridade: 1,
      tickets: null, grupo: '', share: null, nice: null,
      mlqFilaInicial: null, mlfqNivelInicial: null, periodo: null, deadline: null
    });

    this.syncExtraFields();
    this.router.navigate(['/adicionar']);
  }

  adicionar() {
    if (this.formularioProcesso.invalid) {
      this.mensagemErro = 'Preencha os campos obrigatórios.';
      this.formularioProcesso.markAllAsTouched();
      return;
    }

    if (!this.algoritmosSelecionados.length) {
      this.mensagemErro = 'Selecione pelo menos um algoritmo.';
      return;
    }

    const raw = this.formularioProcesso.getRawValue();

    const p: Processo = {
      id: String(raw.id).trim(),
      tempoChegada: Number(raw.tempoChegada),
      duracao: Number(raw.duracao),
      prioridade: this.numOrU(raw.prioridade),

      tickets: this.numOrU(raw.tickets),
      grupo:   this.strOrU(raw.grupo),
      share:   this.numOrU(raw.share),
      nice:    this.numOrU(raw.nice),
      mlqFilaInicial: raw.mlqFilaInicial ?? undefined,
      mlfqNivelInicial: this.numOrU(raw.mlfqNivelInicial),
      periodo: this.numOrU(raw.periodo),
      deadline: this.numOrU(raw.deadline),
    };

    if (!p.id) return;
    if (this.processos().some(x => x.id === p.id)) {
      this.mensagemErro = '⚠️ ID já existe.';
      return;
    }

    this.processos.update(arr => [...arr, p]);
    this.persistProcessos();

    this.formularioProcesso.reset({
      id: '',
      tempoChegada: 0,
      duracao: 1,
      prioridade: 1,
      tickets: null, grupo: '', share: null, nice: null,
      mlqFilaInicial: null, mlfqNivelInicial: null, periodo: null, deadline: null
    });
    this.ultimaSelecaoAlgoritmos = [...this.algoritmosSelecionados];
    this.syncExtraFields();
    this.limparMensagem();
  }

  private limparAlgoritmos() {
    this.formularioConfig.controls.algoritmo.setValue([], { emitEvent: false });
  }

  editar(p: Processo) {
    this.mostrarForm = true;
    this.preferirConfig = true;

    this.formularioProcesso.patchValue({
      id: p.id,
      tempoChegada: p.tempoChegada,
      duracao: p.duracao,
      prioridade: p.prioridade ?? 1,

      tickets: p.tickets ?? null,
      grupo: p.grupo ?? '',
      share: p.share ?? null,
      nice: p.nice ?? null,
      mlqFilaInicial: (p.mlqFilaInicial as any) ?? null,
      mlfqNivelInicial: p.mlfqNivelInicial ?? null,
      periodo: p.periodo ?? null,
      deadline: p.deadline ?? null,
    }, { emitEvent: false });

    this.editingId = p.id;
    this.originalIdEmEdicao = p.id;

    if (!this.algoritmosSelecionados.length && this.ultimaSelecaoAlgoritmos.length) {
      this.formularioConfig.controls.algoritmo.setValue(
        [...this.ultimaSelecaoAlgoritmos] as Algoritmo[], { emitEvent: false }
      );
    }

    this.syncExtraFields();
    this.limparMensagem();

    this.selecaoModo = null;
    this.abaDireitaIndex = 0;
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }

  salvarEdicao() {
    if (this.formularioProcesso.invalid || !this.originalIdEmEdicao) return;
    const raw = this.formularioProcesso.getRawValue();
    const atualizado: Processo = {
      id: String(raw.id).trim(),
      tempoChegada: Number(raw.tempoChegada),
      duracao: Number(raw.duracao),
      prioridade: this.numOrU(raw.prioridade),

      tickets: this.numOrU(raw.tickets),
      grupo:   this.strOrU(raw.grupo),
      share:   this.numOrU(raw.share),
      nice:    this.numOrU(raw.nice),
      mlqFilaInicial: raw.mlqFilaInicial ?? undefined,
      mlfqNivelInicial: this.numOrU(raw.mlfqNivelInicial),
      periodo: this.numOrU(raw.periodo),
      deadline: this.numOrU(raw.deadline),
    };
    if (!atualizado.id) return;

    const conflita = this.processos().some(x => x.id === atualizado.id && x.id !== this.originalIdEmEdicao);
    if (conflita) { this.mensagemErro = '⚠️ Já existe um processo com esse ID.'; return; }

    this.processos.update(arr => arr.map(p => p.id === this.originalIdEmEdicao ? atualizado : p));
    this.persistProcessos();

    this.cancelarEdicao();
    if (this.jaSimulou) this.simular();
  }

  cancelarEdicao() {
    this.editingId = null;
    this.originalIdEmEdicao = null;
    this.formularioProcesso.reset({
      id: '', tempoChegada: 0, duracao: 1, prioridade: 1,
      tickets: null, grupo: '', share: null, nice: null,
      mlqFilaInicial: null, mlfqNivelInicial: null, periodo: null, deadline: null
    });
    this.mostrarForm = false;
    this.syncExtraFields();
    this.limparMensagem();
    if (this.jaSimulou && this.formularioConfig.value.preview) {
      this.formularioConfig.controls.preview.setValue(false, { emitEvent: true });
    }
  }

  remover(id: string) {
    if (this.editingId === id) this.cancelarEdicao();
    this.processos.update(arr => arr.filter(p => p.id !== id));
    this.persistProcessos();
    if (this.processos().length) this.limparMensagem();
    if (this.jaSimulou) this.simular();
  }

  preencherExemplo() {
    this.processos.set([
      { id: 'P1', tempoChegada: 0, duracao: 8, prioridade: 3, tickets: 80,  share: 1, nice: 0,  mlqFilaInicial: 'FG', mlfqNivelInicial: 0, periodo: 12, deadline: 8 },
      { id: 'P2', tempoChegada: 1, duracao: 4, prioridade: 2, tickets: 120, share: 2, nice: 5,  mlqFilaInicial: 'BG', mlfqNivelInicial: 1, periodo: 10, deadline: 6 },
      { id: 'P3', tempoChegada: 2, duracao: 9, prioridade: 1, tickets: 60,  share: 1, nice: -2, mlqFilaInicial: 'BG', mlfqNivelInicial: 2, periodo: 14, deadline: 7 },
      { id: 'P4', tempoChegada: 3, duracao: 5, prioridade: 2, tickets: 200, share: 3, nice: 10, mlqFilaInicial: 'FG', mlfqNivelInicial: 0, periodo: 8,  deadline: 5 },
    ]);
    this.persistProcessos();

    this.resultado = undefined;
    this.dadosGantt = [];
    this.metricasDetalhadas = [];
    this.comparacao = [];
    this.dadosComparacao = { espera: [], retorno: [], resposta: [], justica: [] };
    this.mensagemErro = null;
    this.mostrarForm = false;
    this.preferirConfig = false;
    this.formularioConfig.controls.algoritmo.setValue([], { emitEvent: false });
    this.persistAlgoritmos();
    this.ultimaSelecaoAlgoritmos = [];
    this.cancelarEdicao();
    this.voltarParaSimulacao();
  }

  limpar() {
    this.processos.set([]);
    this.persistProcessos();

    this.resultado = undefined;
    this.dadosGantt = [];
    this.metricasDetalhadas = [];
    this.comparacao = [];
    this.dadosComparacao = { espera: [], retorno: [], resposta: [], justica: [] };
    this.mensagemErro = null;

    this.resultadoConfirmado = undefined;
    this.comparacaoConfirmada = [];
    this.dadosGanttConfirmado = [];
    this.resultadosMulti = {};
    this.ganttMulti = {};
    this.coresGanttMulti = {};
    this.paletaProcessos = {};
    this.kpisResumo = undefined;

    this.formularioConfig.controls.algoritmo.setValue([], { emitEvent: false });
    this.persistAlgoritmos();
    this.ultimaSelecaoAlgoritmos = [];
    this.irParaNovoProcesso();
    this.router.navigate(['/adicionar']);
  }

  private rolarParaResultados() {
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  }

  private ensureAlgoritmosSelecionados(): void {
    const algos = this.algoritmosSelecionados;
    if (!algos.length) {
      const fallback: Algoritmo[] =
        (this.ultimaSelecaoAlgoritmos && this.ultimaSelecaoAlgoritmos.length)
          ? [...this.ultimaSelecaoAlgoritmos] as Algoritmo[]
          : (['FCFS'] as Algoritmo[]);
      this.formularioConfig.controls.algoritmo.setValue(fallback, { emitEvent: false });
      this.persistAlgoritmos();
    }
  }

  simular() {
    try {
      this.preferirConfig = false;
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
        this.preferirConfig = true;
        this.abaDireitaIndex = 0;
        setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
        this.updateChartResultsFromSelection();
        return;
      }

      this.ensureAlgoritmosSelecionados();

      const selecionados = Array.from(new Set(this.algoritmosSelecionados)) as Algoritmo[];

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
        cfs:     { nicePadrao:   Number(this.formularioConfig.value.cfsNicePadrao ?? 0) },
        aging:   { rate: Number(this.formularioConfig.value.agingRate ?? 0.1) },
        mlq:     {
          fgPolitica: String(this.formularioConfig.value.mlqPoliticaFG || 'RR'),
          fgQuantum:  Number(this.formularioConfig.value.mlqQuantumFG ?? 2),
          bgPolitica: String(this.formularioConfig.value.mlqPoliticaBG || 'FCFS'),
          bgQuantum:  Number(this.formularioConfig.value.mlqQuantumBG ?? 4),
        },
        rm:      { periodPadrao: Number(this.formularioConfig.value.rmPeriodPadrao ?? 10) },
        dm:      { deadlinePadrao: Number(this.formularioConfig.value.dmDeadlinePadrao ?? 10) },
      };

      if (selecionados.length === 1) {
        const algo = selecionados[0];
        const listaCopia: Processo[] = base.map(p => ({ ...p }));
        const r = this.executarAlgoritmo(algo, listaCopia, q, opts);
        this.resultado = r;
        const pack = this.montarGanttComCores(r.execucoes);
        this.dadosGantt = pack.dados;
        this.calcularMetricasPorProcesso();

        const extras = this.svc.calcularExtrasGerais(listaCopia, r.execucoes);
        this.kpisResumo = {
          makespan: extras.makespan,
          totalExec: extras.totalExec,
          ociosidade: extras.ociosidade,
          utilizacaoCpu: extras.utilizacaoCpu,
          throughput: extras.throughput,
          ctxSwitches: extras.ctxSwitches
        };

        this.resultadoConfirmado = JSON.parse(JSON.stringify(this.resultado));
        this.comparacaoConfirmada = [];
        this.dadosGanttConfirmado = JSON.parse(JSON.stringify(this.dadosGantt));

        this.updateChartResultsFromSelection();
        this.rolarParaResultados();
        return;
      }

      this.resultado = undefined;
      this.dadosGantt = [];
      this.metricasDetalhadas = [];
      this.kpisResumo = undefined;

      for (const algo of selecionados) {
        try {
          const listaCopia: Processo[] = base.map(p => ({ ...p }));
          const r = this.executarAlgoritmo(algo, listaCopia, q, opts);
          const justica = this.calcularJusticaPorEspera(r, listaCopia);
          const extras = this.svc.calcularExtrasGerais(listaCopia, r.execucoes);

          this.resultadosMulti[algo] = r;
          const { dados, custom } = this.montarGanttComCores(r.execucoes);
          this.ganttMulti[algo] = dados;
          this.coresGanttMulti[algo] = custom;

          this.comparacao.push({
            algoritmo: algo,
            espera: r.tempoMedioEspera,
            retorno: r.tempoMedioRetorno,
            resposta: r.tempoMedioResposta,
            justica,
            makespan: extras.makespan,
            utilizacao: extras.utilizacaoCpu,
            ociosidade: extras.ociosidade,
            throughput: extras.throughput,
            ctxSwitches: extras.ctxSwitches,
            slowdownMedio: extras.slowdownMedio,
            slowdownMax: extras.slowdownMax,
            dpEspera: extras.dpEspera,
            dpRetorno: extras.dpRetorno,
            dpResposta: extras.dpResposta
          });
        } catch (e) {
          console.error(`[${algo}] falhou`, e);
          this.comparacao.push({
            algoritmo: algo, espera: NaN, retorno: NaN, resposta: NaN, justica: NaN,
            makespan: NaN, utilizacao: NaN, ociosidade: NaN, throughput: NaN, ctxSwitches: NaN,
            slowdownMedio: NaN, slowdownMax: NaN, dpEspera: NaN, dpRetorno: NaN, dpResposta: NaN
          });
        }
      }

      this.atualizarGraficosComparacao();
      this.resultadoConfirmado = undefined;
      this.comparacaoConfirmada = this.comparacao.map(c => ({ ...c }));
      this.dadosGanttConfirmado = [];

      this.updateChartResultsFromSelection();
      this.rolarParaResultados();
    } catch (err: any) {
      console.error('Falha geral em simular()', err);
      this.mensagemErro = `Erro ao simular: ${err?.message || err}`;
      this.preferirConfig = true;
      this.abaDireitaIndex = 0;
      this.updateChartResultsFromSelection();
    }
  }

  onChartMetricChange(value: ChartTipo) {
    this.chartSelecionado = value;
    this.updateChartResultsFromSelection();
  }

  private updateChartResultsFromSelection() {
    this.chartResults = this.getDadosComparacao(this.chartSelecionado);
  }

  private atualizarPreviewEdicao() {
    if (!this.originalIdEmEdicao) return;

    const raw = this.formularioProcesso.getRawValue();
    const atualizado: Processo = {
      id: String(raw.id).trim(),
      tempoChegada: Number(raw.tempoChegada),
      duracao: Number(raw.duracao),
      prioridade: this.numOrU(raw.prioridade),

      tickets: this.numOrU(raw.tickets),
      grupo:   this.strOrU(raw.grupo),
      share:   this.numOrU(raw.share),
      nice:    this.numOrU(raw.nice),
      mlqFilaInicial: raw.mlqFilaInicial ?? undefined,
      mlfqNivelInicial: this.numOrU(raw.mlfqNivelInicial),
      periodo: this.numOrU(raw.periodo),
      deadline: this.numOrU(raw.deadline),
    };

    const listaPreview = this.processos().map(p => p.id === this.originalIdEmEdicao ? atualizado : p);

    const selecionados = Array.from(new Set(this.algoritmosSelecionados));
    if (!selecionados.length) {
      this.resultado = undefined;
      this.dadosGantt = [];
      this.metricasDetalhadas = [];
      this.comparacao = [];
      this.resultadosMulti = {};
      this.ganttMulti = {};
      this.coresGanttMulti = {};
      this.kpisResumo = undefined;
      this.updateChartResultsFromSelection();
      return;
    }

    const q = Number(this.formularioConfig.value.quantum ?? 2);
    const opts = {
      mlfq: { niveis: Number(this.formularioConfig.value.mlfqNiveis ?? 3), quantumBase: Number(this.formularioConfig.value.mlfqQuantumBase ?? 2), boost: Number(this.formularioConfig.value.mlfqBoost ?? 50) },
      lottery: { ticketsPadrao: Number(this.formularioConfig.value.lotteryTicketsPadrao ?? 100) },
      stride:  { ticketsPadrao: Number(this.formularioConfig.value.strideTicketsPadrao ?? 100) },
      fair:    { sharePadrao:  Number(this.formularioConfig.value.fairSharePadrao ?? 1) },
      cfs:     { nicePadrao:   Number(this.formularioConfig.value.cfsNicePadrao ?? 0) },
      aging:   { rate: Number(this.formularioConfig.value.agingRate ?? 0.1) },
      mlq:     {
        fgPolitica: String(this.formularioConfig.value.mlqPoliticaFG || 'RR'),
        fgQuantum:  Number(this.formularioConfig.value.mlqQuantumFG ?? 2),
        bgPolitica: String(this.formularioConfig.value.mlqPoliticaBG || 'FCFS'),
        bgQuantum:  Number(this.formularioConfig.value.mlqQuantumBG ?? 4),
      },
      rm:      { periodPadrao: Number(this.formularioConfig.value.rmPeriodPadrao ?? 10) },
      dm:      { deadlinePadrao: Number(this.formularioConfig.value.dmDeadlinePadrao ?? 10) },
    };

    this.construirPaletaProcessos(listaPreview);

    if (selecionados.length === 1) {
      const algo = selecionados[0] as Algoritmo;
      const r = this.executarAlgoritmo(algo, listaPreview.map(p => ({ ...p })), q, opts);
      const pack = this.montarGanttComCores(r.execucoes);
      this.resultado = r;
      this.dadosGantt = pack.dados;
      this.calcularMetricasPorProcesso();
      const extras = this.svc.calcularExtrasGerais(listaPreview, r.execucoes);
      this.kpisResumo = {
        makespan: extras.makespan,
        totalExec: extras.totalExec,
        ociosidade: extras.ociosidade,
        utilizacaoCpu: extras.utilizacaoCpu,
        throughput: extras.throughput,
        ctxSwitches: extras.ctxSwitches
      };
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
        const extras = this.svc.calcularExtrasGerais(listaPreview, r.execucoes);
        this.comparacao.push({
          algoritmo: algo,
          espera: r.tempoMedioEspera,
          retorno: r.tempoMedioRetorno,
          resposta: r.tempoMedioResposta,
          justica,
          makespan: extras.makespan,
          utilizacao: extras.utilizacaoCpu,
          ociosidade: extras.ociosidade,
          throughput: extras.throughput,
          ctxSwitches: extras.ctxSwitches,
          slowdownMedio: extras.slowdownMedio,
          slowdownMax: extras.slowdownMax,
          dpEspera: extras.dpEspera,
          dpRetorno: extras.dpRetorno,
          dpResposta: extras.dpResposta
        });
        const { dados, custom } = this.montarGanttComCores(r.execucoes);
        this.resultadosMulti[algo] = r;
        this.ganttMulti[algo] = dados;
        this.coresGanttMulti[algo] = custom;
      }
      this.atualizarGraficosComparacao();
    }

    this.updateChartResultsFromSelection();
  }

  private atualizarGraficosComparacao() {
    const make = (campo: keyof ResultadoComparacao) =>
      this.comparacao.map(c => ({ name: c.algoritmo, value: (c as any)[campo] as number }));
    this.dadosComparacao.espera   = make('espera');
    this.dadosComparacao.retorno  = make('retorno');
    this.dadosComparacao.resposta = make('resposta');
    this.dadosComparacao.justica  = make('justica');
  }

  getDadosComparacao(tipo: ChartTipo) {
    if (tipo === 'espera')   return this.dadosComparacao.espera;
    if (tipo === 'retorno')  return this.dadosComparacao.retorno;
    if (tipo === 'resposta') return this.dadosComparacao.resposta;
    if (tipo === 'justica')  return this.dadosComparacao.justica;
    return this.comparacao.map(c => ({ name: c.algoritmo, value: (c as any)[tipo] as number }));
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
      case 'HRRN':             return this.svc.simularHRRN(lista);
      case 'PRIORIDADE_AGING': return this.svc.simularPrioridadeAging(lista, opts.aging);
      case 'MLQ':              return this.svc.simularMLQ(lista, opts.mlq);
      case 'RM':               return this.svc.simularRM(lista, opts.rm);
      case 'DM':               return this.svc.simularDM(lista, opts.dm);
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
    const series = preenchido.map(e => ({ name: `${e.processoId} (${e.inicio}-${e.fim})`, value: Math.max(0, e.fim - e.inicio), extra: e }));
    const dados = [{ name: 'CPU', series }];
    const custom = preenchido.map(e => ({ name: `${e.processoId} (${e.inicio}-${e.fim})`, value: this.paletaProcessos[e.processoId] || '#888' }));
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

  kpisResumo?: { makespan: number; totalExec: number; ociosidade: number; utilizacaoCpu: number; throughput: number; ctxSwitches: number; };

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
      if (e.inicio > cursor) cores.push({ name: `IDLE (${cursor}-${e.inicio})`, value: this.paletaProcessos['IDLE'] || this.idleColor });
      cores.push({ name: `${e.processoId} (${e.inicio}-${e.fim})`, value: this.paletaProcessos[e.processoId] || '#888' });
      cursor = Math.max(cursor, e.fim);
    }
    const h = this.highlightedName;
    return h ? cores.map(c => c.name === h ? { name: c.name, value: this.highlightColor } : c) : cores;
  }

  getJustica(algo: Algoritmo): number {
    const item = this.comparacao.find(c => c.algoritmo === algo);
    return item ? item.justica : NaN;
  }

  processosOrdenados(): Processo[] {
    return [...this.processos()].sort((a, b) => a.tempoChegada - b.tempoChegada || a.id.localeCompare(b.id));
  }

  escolherNaLista(id: string) {
    const p = this.processos().find(x => x.id === id);
    if (!p) { this.voltarParaSimulacao(); return; }

    if (this.selecaoModo === 'editar') {
      this.editar(p);
      this.selecaoModo = null;
      this.abaDireitaIndex = 0;
    } else if (this.selecaoModo === 'remover') {
      this.remover(id);
      this.selecaoModo = 'remover';
      this.abaDireitaIndex = 1;
    }
  }

  editarDock() {
    if (!(this.modo === 'exploration' && this.page === 'edit')) {
      this.router.navigate(['/editar']);
      return;
    }
    if (this.editingId) {
      if (this.formularioProcesso.valid) this.salvarEdicao();
      else this.cancelarEdicao();
    } else {
      this.selecaoModo = 'editar';
      this.abaDireitaIndex = 1;
    }
  }

  removerDock() {
    if (!this.processos().length) return;
    this.router.navigate(['/remover']);
  }

  async simularDock() {
    this.limparMensagem();

    if (!this.processos().length) {
      this.mensagemErro = '⚠️ Adicione pelo menos 1 processo para simular.';
      await this.router.navigate(['/adicionar']);
      return;
    }

    this.ensureAlgoritmosSelecionados();
    this.editingId = null;
    this.originalIdEmEdicao = null;

    await this.router.navigate(
      ['/simular'],
      { queryParams: { run: '1', t: Date.now() }, queryParamsHandling: 'merge' }
    );
  }

  private entrarEmRemover() {
    this.preferirConfig = true;
    this.mostrarForm = false;
    this.selecaoModo = 'remover';
    this.abaDireitaIndex = 1;
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 0);
  }
}
