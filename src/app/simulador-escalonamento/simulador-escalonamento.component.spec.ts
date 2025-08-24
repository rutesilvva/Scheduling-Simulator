import { ComponentFixture, TestBed } from '@angular/core/testing';
import { SimuladorEscalonamentoComponent } from './simulador-escalonamento';

describe('SimuladorEscalonamentoComponent', () => {
  let component: SimuladorEscalonamentoComponent;
  let fixture: ComponentFixture<SimuladorEscalonamentoComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SimuladorEscalonamentoComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(SimuladorEscalonamentoComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
