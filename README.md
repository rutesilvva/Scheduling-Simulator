# Scheduling Simulator

Simulador interativo de algoritmos de escalonamento de CPU, desenvolvido em **Angular + TypeScript** com interface em **Angular Material** e gráficos em **ngx-charts**.  
## Funcionalidades

- **Cadastro de processos** com:
  - ID único
  - Tempo de chegada (≥ 0)
  - Duração (burst time)
  - Prioridade (opcional)

- **Algoritmos implementados**:
  - FCFS (First Come, First Served)
  - SJF (Shortest Job First)
  - SRTF (Shortest Remaining Time First)
  - Round Robin (configurável com quantum)
  - Prioridade (não-preemptivo)

- **Simulação completa em tempo real**:
  - Execução no navegador (sem backend)
  - Diagrama de Gantt (uso da CPU)
  - Métricas automáticas:
    - Tempo médio de espera
    - Tempo médio de retorno (turnaround)
    - Tempo médio de resposta

- **Comparação entre algoritmos**:
  - Tabela com métricas lado a lado
  - Gráfico de barras comparativo
  - Métrica extra de **Justiça (Jain)**

- **Recursos adicionais**:
  - Edição de processos já cadastrados
  - Pré-visualização de métricas durante edição (opcional via toggle)
  - Reset e preenchimento automático com exemplos
  - Validação de entrada (não aceita chegadas negativas, burst ≥ 1)

## Interface

- **Formulário** para inserir ou editar processos  
- **Tabela de processos** cadastrados com ações de editar/excluir  
- **Seção de configuração** para escolher algoritmos e parâmetros  
- **Visualização dos resultados**:
  - Métricas agregadas
  - Gráfico de Gantt
  - Métricas por processo
  - Comparação entre algoritmos

## Tecnologias

- [Angular](https://angular.io/)
- [TypeScript](https://www.typescriptlang.org/)
- [Angular Material](https://material.angular.io/)
- [Ngx-Charts](https://swimlane.github.io/ngx-charts/)





