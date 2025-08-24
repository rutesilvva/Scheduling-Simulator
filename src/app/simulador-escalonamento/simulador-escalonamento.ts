import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { NgxChartsModule, Color, ScaleType } from '@swimlane/ngx-charts';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { EscalonamentoService } from '../escalonamento.service';
import { Processo } from '../models/processo';
import { ResultadoSimulacao } from '../models/resultado-simulacao';

type Algoritmo = 'FCFS' | 'SJF' | 'SRTF' | 'RR' | 'PRIORIDADE';

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
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatSelectModule,
    MatIconModule,
    MatTableModule,
    MatChipsModule,
    NgxChartsModule,
    MatSlideToggleModule,
  ],
  templateUrl: './simulador-escalonamento.component.html',
  styleUrls: ['./simulador-escalonamento.component.css']
})
export class SimuladorEscalonamentoComponent implements OnInit {
  private fb = inject(FormBuilder);
  mensagemErro: string | null = null;

  colunas = ['id', 'chegada', 'duracao', 'prioridade', 'acoes'];
  processos = signal<Processo[]>([]);

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
    preview: [false]
  });

  get algoritmosSelecionados(): Algoritmo[] {
    return (this.formularioConfig.value.algoritmo || []) as Algoritmo[];
  }
  get jaSimulou(): boolean {
    return !!this.resultado || this.comparacao.length > 0;
  }

  resultado?: ResultadoSimulacao;
  dadosGantt: any[] = [];
  comparacao: ResultadoComparacao[] = [];
  dadosComparacaoEspera: { name: string; value: number }[] = [];
  dadosComparacaoVazios = false;

  private resultadoConfirmado?: ResultadoSimulacao;
  private comparacaoConfirmada: ResultadoComparacao[] = [];
  private dadosGanttConfirmado: any[] = [];

  metricasDisponiveis = [
    { key: 'espera',   label: 'Espera média' },
    { key: 'retorno',  label: 'Retorno médio' },
    { key: 'resposta', label: 'Resposta média' },
    { key: 'justica',  label: 'Justiça (Jain)' },
  ] as const;
  metricaSelecionada: (typeof this.metricasDisponiveis)[number]['key'] = 'espera';

  colorScheme: Color = {
    name: 'custom',
    selectable: true,
    group: ScaleType.Ordinal,
    domain: ['#5AA454', '#A10A28', '#C7B42C', '#7AA3E5', '#AAAAAA']
  };

  constructor(private svc: EscalonamentoService) {}

  ngOnInit(): void {
    this.formularioProcesso.valueChanges.subscribe(() => {
      this.limparMensagem();
      if (this.editingId && this.jaSimulou && this.formularioConfig.value.preview) {
        this.atualizarPreviewEdicao();
      }
    });

    this.formularioConfig.valueChanges.subscribe(() => {
      this.limparMensagem();
      if (this.editingId && this.jaSimulou && this.formularioConfig.value.preview) {
        this.atualizarPreviewEdicao();
      }
    });

    this.formularioConfig.controls.preview.valueChanges.subscribe(ativo => {
      if (!this.jaSimulou) return;

      if (ativo) {
        if (this.editingId) this.atualizarPreviewEdicao();
      } else {
        this.resultado = this.resultadoConfirmado
          ? JSON.parse(JSON.stringify(this.resultadoConfirmado))
          : undefined;

        this.comparacao = this.comparacaoConfirmada.map(c => ({ ...c }));
        this.dadosGantt = JSON.parse(JSON.stringify(this.dadosGanttConfirmado));

        if (this.resultado) {
          this.calcularMetricasPorProcesso();
        } else {
          this.atualizarGraficoComparacao();
        }
      }
    });
  }

  limparMensagem() { this.mensagemErro = null; }

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
    if (conflita) {
      this.mensagemErro = '⚠️ Já existe um processo com esse ID.';
      return;
    }

    this.processos.update(arr => arr.map(p => p.id === this.originalIdEmEdicao ? atualizado : p));
    this.cancelarEdicao();

    if (this.jaSimulou) this.simular();
  }

  cancelarEdicao() {
    this.editingId = null;
    this.originalIdEmEdicao = null;
    this.formularioProcesso.reset({ id: '', tempoChegada: 0, duracao: 1, prioridade: 1 });
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
      { id: 'P1', tempoChegada: 0, duracao: 4, prioridade: 1 },
      { id: 'P2', tempoChegada: 1, duracao: 3, prioridade: 2 },
      { id: 'P3', tempoChegada: 2, duracao: 1, prioridade: 1 },
    ]);
    this.resultado = undefined;
    this.dadosGantt = [];
    this.metricasDetalhadas = [];
    this.comparacao = [];
    this.dadosComparacaoEspera = [];
    this.dadosComparacaoVazios = false;
    this.mensagemErro = null;
    this.cancelarEdicao();
  }

  limpar() {
    this.processos.set([]);
    this.resultado = undefined;
    this.dadosGantt = [];
    this.metricasDetalhadas = [];
    this.comparacao = [];
    this.dadosComparacaoEspera = [];
    this.dadosComparacaoVazios = false;
    this.mensagemErro = null;
    this.cancelarEdicao();
    this.resultadoConfirmado = undefined;
    this.comparacaoConfirmada = [];
    this.dadosGanttConfirmado = [];
  }

  simular() {
    const base = this.processos();
    if (!base.length) {
      this.mensagemErro = '⚠️ Adicione pelo menos 1 processo para simular.';
      this.resultado = undefined;
      this.dadosGantt = [];
      this.metricasDetalhadas = [];
      this.comparacao = [];
      this.dadosComparacaoEspera = [];
      this.dadosComparacaoVazios = false;
      return;
    }

    this.mensagemErro = null;

    const selecionados = Array.from(new Set(this.algoritmosSelecionados));
    const q = Number(this.formularioConfig.value.quantum ?? 2);

    this.comparacao = [];
    this.dadosComparacaoEspera = [];
    this.dadosComparacaoVazios = false;

    if (selecionados.length === 1) {
      const algo = selecionados[0];
      const listaCopia: Processo[] = base.map(p => ({ ...p }));
      try {
        this.resultado = this.executarAlgoritmo(algo, listaCopia, q);
        this.montarGantt(this.resultado!.execucoes);
        this.calcularMetricasPorProcesso();

        this.resultadoConfirmado = JSON.parse(JSON.stringify(this.resultado));
        this.comparacaoConfirmada = [];
        this.dadosGanttConfirmado = JSON.parse(JSON.stringify(this.dadosGantt));
      } catch (e) {
        console.error(`[${algo}] falhou`, e);
        this.resultado = undefined;
        this.dadosGantt = [];
        this.metricasDetalhadas = [];
        this.mensagemErro = `Falha ao simular ${algo}.`;
      }
      return;
    }
    this.resultado = undefined;
    this.dadosGantt = [];
    this.metricasDetalhadas = [];

    for (const algo of selecionados) {
      const listaCopia: Processo[] = base.map(p => ({ ...p }));
      try {
        const r = this.executarAlgoritmo(algo, listaCopia, q);
        const justica = this.calcularJusticaPorEspera(r, listaCopia);
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
    this.atualizarGraficoComparacao();

    this.resultadoConfirmado = undefined;
    this.comparacaoConfirmada = this.comparacao.map(c => ({ ...c }));
    this.dadosGanttConfirmado = []; 
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

    if (selecionados.length === 1) {
      const algo = selecionados[0];
      const r = this.executarAlgoritmo(algo, listaPreview.map(p => ({ ...p })), q);
      this.resultado = r;
      this.montarGantt(r.execucoes);
      this.calcularMetricasPorProcesso();
    } else {
      this.resultado = undefined;
      this.dadosGantt = [];
      this.metricasDetalhadas = [];
      this.comparacao = [];

      for (const algo of selecionados) {
        const r = this.executarAlgoritmo(algo, listaPreview.map(p => ({ ...p })), q);
        const justica = this.calcularJusticaPorEspera(r, listaPreview);
        this.comparacao.push({
          algoritmo: algo,
          espera: r.tempoMedioEspera,
          retorno: r.tempoMedioRetorno,
          resposta: r.tempoMedioResposta,
          justica
        });
      }
      this.atualizarGraficoComparacao();
    }
  }

  onTrocarMetrica() {
    if (this.comparacao.length) this.atualizarGraficoComparacao();
  }

  private atualizarGraficoComparacao() {
    const campo = this.metricaSelecionada;
    const barras = this.comparacao.map(c => ({ name: c.algoritmo, value: c[campo] as number }));
    const total = barras.reduce((s, b) => s + (isFinite(b.value) ? b.value : 0), 0);
    this.dadosComparacaoVazios = (total === 0);
    this.dadosComparacaoEspera = barras;
  }

  private executarAlgoritmo(algo: Algoritmo, lista: Processo[], quantum: number): ResultadoSimulacao {
    switch (algo) {
      case 'FCFS':       return this.svc.simularFCFS(lista);
      case 'SJF':        return this.svc.simularSJF(lista);
      case 'SRTF':       return this.svc.simularSRTF(lista);
      case 'RR':         return this.svc.simularRR(lista, quantum);
      case 'PRIORIDADE': return this.svc.simularPrioridade(lista);
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

  private montarGantt(execs: { processoId: string; inicio: number; fim: number }[]) {
    const series = execs.map(e => ({
      name: `${e.processoId} (${e.inicio}-${e.fim})`,
      value: e.fim - e.inicio,
      extra: e
    }));
    this.dadosGantt = [{ name: 'CPU', series }];
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
}
