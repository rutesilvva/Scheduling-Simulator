import { TestBed } from '@angular/core/testing';
import { EscalonamentoService } from './escalonamento.service';

describe('EscalonamentoService', () => {
  let service: EscalonamentoService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EscalonamentoService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
