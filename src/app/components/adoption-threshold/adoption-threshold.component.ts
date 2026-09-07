import { ChangeDetectorRef, Component, EventEmitter, Input, Output, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Scenario } from '../../models/scenario.model';
import {
  ScenarioDataService,
  AdoptionPersona,
  AdoptionThresholdScenario,
  AdoptionThresholdResult,
  AdoptionThresholdBaselineScenario,
} from '../../services/scenario-data.service';

@Component({
  selector: 'app-adoption-threshold',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="threshold-section">
      <div class="threshold-card">
        
        <div class="threshold-header">
          <div class="header-titles">
            <h3>目標達成に向けた推奨採用ペルソナ</h3>
            <p class="threshold-sub">既存100名の組織構成から算出した最適パラメータ</p>
          </div>

          <button
            type="button"
            class="btn-run-threshold"
            (click)="runSimulation()"
            [disabled]="loading || !baseScenarios || baseScenarios.length < 4"
          >
            {{ loading ? '解析中...' : '再計算' }}
          </button>
        </div>

        @if (loading) {
          <div class="threshold-loading">
            <div class="spinner"></div>
            <p>最適な採用ペルソナを算出中...</p>
          </div>
        }

        @if (errorMessage) {
          <div class="error-box"><p>{{ errorMessage }}</p></div>
        }

        @if (hasRun && !loading) {
          <div class="recommendation-container">

            @if (bestPersona) {
              <div class="hero-recommendation-card">
                <div class="hero-main-line">
                  <div class="hero-type-badge">
                    <span class="badge-label">最優先推奨</span>
                    <strong class="persona-name">{{ bestPersona.label }}</strong>
                  </div>

                  @if (bestResult?.reached) {
                    <span class="impact-txt">
                      最小 <strong>{{ bestResult?.minCount }}</strong> 名で目標達成可能
                    </span>
                  }
                </div>

                <div class="hero-params-line">
                  <div class="params-group">
                    <span>営業 <strong>{{ bestPersona.sales }}</strong></span>
                    <span>管理 <strong>{{ bestPersona.management }}</strong></span>
                    <span>開拓 <strong>{{ bestPersona.development }}</strong></span>
                    <span>育成 <strong>{{ bestPersona.training }}</strong></span>
                    <span class="cost-tag">人件費 {{ bestPersona.cost }}百万円</span>
                  </div>

                  <button
                    type="button"
                    class="btn-apply-hero"
                    (click)="onApplyPersona(bestPersona)"
                  >
                    この条件を適用
                  </button>
                </div>
              </div>
            }

            <div class="sub-personas-row">
              <span class="sub-label">その他候補:</span>
              <div class="sub-chips">
                @for (persona of otherPersonas; track persona.key) {
                  <button
                    type="button"
                    class="btn-sub-chip"
                    (click)="onApplyPersona(persona)"
                  >
                    {{ persona.label }} (人件費{{ persona.cost }}M) を反映
                  </button>
                }
              </div>
            </div>

          </div>
        }

      </div>
    </section>
  `,
  styles: [`
    .threshold-section { margin-bottom: 0; }
    .threshold-card {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      padding: 8px 12px;
      box-shadow: 0 1px 3px rgba(15, 23, 42, 0.03);
    }

    .threshold-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .header-titles h3 {
      margin: 0;
      font-size: 0.88rem;
      font-weight: 800;
      color: #0f172a;
    }

    .threshold-sub {
      margin: 1px 0 0 0;
      font-size: 0.68rem;
      color: #64748b;
    }

    .btn-run-threshold {
      background: #ffffff;
      color: #1e3a8a;
      border: 1px solid #cbd5e1;
      border-radius: 4px;
      padding: 2px 8px;
      font-size: 0.7rem;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-run-threshold:hover:not(:disabled) { 
      background: #f0f4ff; 
      border-color: #1e3a8a;
    }

    .threshold-loading {
      display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #f8fafc; border-radius: 4px;
    }
    .threshold-loading p { margin: 0; font-size: 0.72rem; color: #475569; }
    .spinner {
      width: 12px; height: 12px; border: 2px solid #cbd5e1; border-top-color: #1e3a8a; border-radius: 50%;
      animation: threshold-spin 0.8s linear infinite;
    }
    @keyframes threshold-spin { to { transform: rotate(360deg); } }

    .error-box {
      margin-top: 6px; padding: 4px 8px; background: #fef2f2;
      color: #991b1b; border-radius: 4px; font-size: 0.7rem;
    }

    .recommendation-container { display: flex; flex-direction: column; gap: 6px; }

    .hero-recommendation-card {
      background: #f8fafc;
      border: 1px solid #1e3a8a;
      border-radius: 6px;
      padding: 6px 10px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .hero-main-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .hero-type-badge {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .badge-label {
      background: #1e3a8a;
      color: #ffffff;
      font-size: 0.62rem;
      font-weight: 800;
      padding: 1px 5px;
      border-radius: 3px;
    }

    .persona-name {
      font-size: 0.85rem;
      font-weight: 800;
      color: #0f172a;
    }

    .impact-txt {
      font-size: 0.72rem;
      color: #059669;
      background: #ecfdf5;
      padding: 1px 6px;
      border-radius: 3px;
      font-weight: 700;
      border: 1px solid #a7f3d0;
    }

    .hero-params-line {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
      padding-top: 4px;
      border-top: 1px solid #e2e8f0;
    }

    .params-group {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 0.72rem;
      color: #334155;
    }

    .cost-tag {
      background: #f3e8ff;
      color: #6b21a8;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 3px;
      font-size: 0.65rem;
    }

    .btn-apply-hero {
      background: #1e3a8a;
      color: #ffffff;
      border: none;
      border-radius: 4px;
      padding: 3px 10px;
      font-size: 0.72rem;
      font-weight: 800;
      cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s ease;
    }
    .btn-apply-hero:hover { background: #1d4ed8; }

    .sub-personas-row {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .sub-label {
      font-size: 0.68rem;
      color: #64748b;
      font-weight: 700;
      white-space: nowrap;
    }

    .sub-chips {
      display: flex;
      align-items: center;
      gap: 4px;
      flex-wrap: wrap;
    }

    .btn-sub-chip {
      background: #ffffff;
      border: 1px solid #cbd5e1;
      color: #1e293b;
      font-size: 0.65rem;
      font-weight: 600;
      padding: 2px 6px;
      border-radius: 3px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .btn-sub-chip:hover {
      border-color: #1e3a8a;
      color: #1e3a8a;
      background: #f0f4ff;
    }
  `]
})
export class AdoptionThresholdComponent implements OnInit, OnChanges {
  @Input() baseScenarios: Scenario[] = [];
  @Input() targetSales = 58.0;

  @Output() applyPersona = new EventEmitter<AdoptionPersona>();

  loading = false;
  hasRun = false;
  errorMessage = '';

  personas: AdoptionPersona[] = [];
  scenarios: AdoptionThresholdScenario[] = [];
  results: AdoptionThresholdResult[] = [];

  bestPersona: AdoptionPersona | null = null;
  bestResult: AdoptionThresholdResult | null = null;
  otherPersonas: AdoptionPersona[] = [];

  private static readonly MODE_BY_SCENARIO_ID: Record<number, string> = {
    1: 'total_sales',
    2: 'a_profit',
    3: 'b_sales',
    4: 'c_sales',
  };

  constructor(
    private scenarioDataService: ScenarioDataService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.checkAndAutoRun();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['baseScenarios'] || changes['targetSales']) {
      this.checkAndAutoRun();
    }
  }

  private checkAndAutoRun(): void {
    if (!this.hasRun && !this.loading && this.baseScenarios && this.baseScenarios.length >= 4) {
      this.runSimulation();
    }
  }

  runSimulation(): void {
    if (!this.baseScenarios || this.baseScenarios.length < 4) return;

    this.loading = true;
    this.errorMessage = '';

    const payload: AdoptionThresholdBaselineScenario[] = this.baseScenarios.map(s => ({
      id: s.id,
      mode: AdoptionThresholdComponent.MODE_BY_SCENARIO_ID[s.id] ?? 'total_sales',
      totalSales: s.totalSales,
      totalProfit: s.totalProfit,
      departments: {
        A: { count: s.departments.A.count, ability: s.departments.A.ability, sales: s.departments.A.sales },
        B: { count: s.departments.B.count, ability: s.departments.B.ability, sales: s.departments.B.sales },
        C: { count: s.departments.C.count, ability: s.departments.C.ability, sales: s.departments.C.sales },
      },
    }));

    this.scenarioDataService.getAdoptionThreshold(payload, this.targetSales).subscribe({
      next: (res) => {
        this.personas = res.personas;
        this.scenarios = res.scenarios;
        this.results = res.results;
        this.hasRun = true;
        this.loading = false;

        this.evaluateBestPersona();

        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('必要人材シミュレーションエラー:', err);
        this.errorMessage = '必要人材シミュレーションの取得に失敗しました。';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }

  private evaluateBestPersona(): void {
    if (!this.personas || this.personas.length === 0) return;

    const targetScenarioId = this.scenarios[0]?.id ?? 1;

    let bestP = this.personas[0];
    let minCount = 999;

    for (const p of this.personas) {
      const res = this.results.find(r => r.personaKey === p.key && r.scenarioId === targetScenarioId);
      if (res && res.reached && res.minCount !== null && res.minCount < minCount) {
        minCount = res.minCount;
        bestP = p;
      }
    }

    this.bestPersona = bestP;
    this.bestResult = this.results.find(r => r.personaKey === bestP.key && r.scenarioId === targetScenarioId) ?? null;
    this.otherPersonas = this.personas.filter(p => p.key !== bestP.key);
  }

  onApplyPersona(persona: AdoptionPersona): void {
    this.applyPersona.emit(persona);
  }
}