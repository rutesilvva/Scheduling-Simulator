import { Routes } from '@angular/router';
import { SimuladorEscalonamentoComponent } from './simulador-escalonamento/simulador-escalonamento';

export const routes: Routes = [
  { path: 'aula',     component: SimuladorEscalonamentoComponent, data: { mode: 'lecture',     page: 'home'     } },

  { path: 'simular',  component: SimuladorEscalonamentoComponent, data: { mode: 'exploration', page: 'simulate' } },
  { path: 'adicionar',component: SimuladorEscalonamentoComponent, data: { mode: 'exploration', page: 'add'      } },
  { path: 'editar',   component: SimuladorEscalonamentoComponent, data: { mode: 'exploration', page: 'edit'     } },
  { path: 'editar/:id',component: SimuladorEscalonamentoComponent,data: { mode: 'exploration', page: 'edit'     } },

  { path: 'remover',  component: SimuladorEscalonamentoComponent, data: { mode: 'exploration', page: 'remove'   } },

  { path: 'explorar', pathMatch: 'full', redirectTo: 'simular' },
  { path: '',         pathMatch: 'full', redirectTo: 'aula'     },
  { path: '**',                       redirectTo: 'aula'        },
];