import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Scenario } from '../../models/scenario.model';
import { CandidateEmployee } from '../adoption-control/adoption-control.component';

type DeptKey = 'A' | 'B' | 'C';

@Component({
  selector: 'app-adoption-diff',
  standalone: true,
  imports: [CommonModule],
  template: `
    <!-- ★ Pythonからの最適化計算が「完了」して実データが存在する時だけ表示！ -->
    @if (hasCalculatedResult) {
      <section class="diff-section">
        <div class="diff-card">
          <div class="diff-header">
            <div>
              <span class="diff-badge">追加採用 ROI インパクト分析</span>
              <h3>通常100名 vs 追加採用 (+{{ candidates.length }}名) の効果比較</h3>
              <p class="diff-sub">選択中: {{ scenario?.name || 'シナリオ1' }}</p>
            </div>

            <div class="status-pill active">
              <span class="dot green"></span>
              <span>追加採用シミュレーション試算結果 ({{ candidates.length }}名適用)</span>
            </div>
          </div>

          <!-- 1. KPI差分サマリーカード -->
          <div class="diff-kpi-grid">
            <!-- 売上差分 -->
            <div class="kpi-box">
              <span class="kpi-label">売上増分</span>
              <div class="kpi-val-group">
                <strong class="kpi-value">+{{ salesDiff | number:'1.2-2' }} 億円</strong>
              </div>
              <small class="kpi-note">人件費増を上回る増収効果</small>
            </div>

            <!-- 人件費（追加コスト） -->
            <div class="kpi-box">
              <span class="kpi-label">追加人件費コスト</span>
              <div class="kpi-val-group">
                <strong class="kpi-value warning">-{{ totalAdditionalCostCost | number:'1.2-2' }} 億円</strong>
                <span class="diff-tag cost">+{{ candidates.length }}名分</span>
              </div>
              <small class="kpi-note">給与＋福利厚生・管理費込 (3倍算定)</small>
            </div>

            <!-- 純利益差分 (ROI) -->
            <div class="kpi-box highlight">
              <span class="kpi-label">純増利益 (投資回収効果)</span>
              <div class="kpi-val-group">
                <strong class="kpi-value" [class.negative]="netProfitDiff < 0">
                  {{ netProfitDiff >= 0 ? '+' : '' }}{{ netProfitDiff | number:'1.2-2' }} 億円
                </strong>
                <span class="diff-tag" [class.positive]="netProfitDiff >= 0" [class.negative]="netProfitDiff < 0">
                  {{ netProfitDiff >= 0 ? '投資効果あり ★' : '採算割り込み ⚠️' }}
                </span>
              </div>
              <small class="kpi-note">売上増分 − 追加人件費コスト</small>
            </div>
          </div>

          <!-- 2. 事業部別の増員・適正人数スライド比較表 -->
          @if (scenario) {
            <div class="dept-diff-table-container">
              <h4>事業部別の最適配置と充足率スライド</h4>
              <table class="diff-table">
                <thead>
                  <tr>
                    <th>事業部</th>
                    <th>配置人数</th>
                    <th>新・適正基準</th>
                    <th>充足率</th>
                    <th>事業部売上</th>
                  </tr>
                </thead>
                <tbody>
                  @for (deptKey of deptList; track deptKey) {
                    <tr>
                      <td><strong>{{ deptKey }}事業部</strong></td>
                      <td>
                        <span class="count-badge">
                          {{ scenario.departments[deptKey]?.count || 0 }} 名
                        </span>
                      </td>
                      <td>{{ dynamicAppropriate[deptKey] }} 名 (最低 {{ dynamicMinimum[deptKey] }} 名)</td>
                      <td>
                        <div class="rate-bar-wrapper">
                          <div class="rate-bar" [style.width.%]="getFulfillmentRate(deptKey)"></div>
                          <span class="rate-text">{{ getFulfillmentRate(deptKey) | number:'1.0-0' }}%</span>
                        </div>
                      </td>
                      <td><strong>{{ scenario.departments[deptKey]?.sales | number:'1.2-2' }} 億円</strong></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </section>
    }
  `,
  styleUrl: './adoption-diff.component.css'
})
export class AdoptionDiffComponent implements OnChanges {
  @Input() mode: 'standard' | 'adoption' = 'standard';
  @Input() scenario: Scenario | null = null;
  @Input() candidates: CandidateEmployee[] = [];

  readonly deptList: DeptKey[] = ['A', 'B', 'C'];

  dynamicAppropriate: Record<DeptKey, number> = { A: 40, B: 35, C: 25 };
  dynamicMinimum: Record<DeptKey, number> = { A: 30, B: 20, C: 10 };

  // ★ 判定：追加採用モード ＋ シナリオが存在 ＋ 候補者あり ＋ Python計算完了フラグ/差分がある時のみtrue
  get hasCalculatedResult(): boolean {
    if (this.mode !== 'adoption' || !this.scenario || !this.candidates || this.candidates.length === 0) {
      return false;
    }
    // addedSalesDiff または Python側で追加計算されたフラグが存在するか判定
    return (this.scenario as any).isAdoptionResult === true || typeof (this.scenario as any).addedSalesDiff === 'number';
  }

  ngOnChanges(): void {
    if (this.hasCalculatedResult) {
      this.recalculateDynamicSettings();
    }
  }

  private recalculateDynamicSettings(): void {
    const total = 100 + (this.candidates?.length || 0);

    const rawA = total * 0.40;
    const rawB = total * 0.35;
    const rawC = total * 0.25;

    const appA = Math.floor(rawA);
    const appB = Math.floor(rawB);
    const appC = Math.floor(rawC);

    const rems = [
      { dept: 'A' as DeptKey, rem: rawA - appA },
      { dept: 'B' as DeptKey, rem: rawB - appB },
      { dept: 'C' as DeptKey, rem: rawC - appC }
    ].sort((a, b) => b.rem - a.rem);

    const app: Record<DeptKey, number> = { A: appA, B: appB, C: appC };
    let shortage = total - (appA + appB + appC);
    for (let i = 0; i < shortage; i++) {
      app[rems[i].dept]++;
    }

    this.dynamicAppropriate = app;
    this.dynamicMinimum = {
      A: Math.floor(app.A * 0.75),
      B: Math.floor(app.B * (20 / 35)),
      C: Math.floor(app.C * 0.40)
    };
  }

  // 売上増分
  get salesDiff(): number {
    if (!this.scenario) return 0;
    const addedDiff = (this.scenario as any).addedSalesDiff ?? (this.scenario as any).salesDiff;
    if (typeof addedDiff === 'number') return addedDiff;
    
    // 計算結果の全社売上から100名基準58.00億を引き算
    return Math.max(0, Number(((this.scenario.totalSales || 0) - 58.00).toFixed(2)));
  }

  // 追加人件費コスト
  get totalAdditionalCostCost(): number {
    if (!this.candidates || this.candidates.length === 0) return 0;
    
    const totalTenThousand = this.candidates.reduce((sum, c) => {
      const cAny = c as any;
      const salaryInTenThousand = cAny.salary ?? (c.cost ? c.cost * 100 : undefined) ?? 600;
      return sum + (salaryInTenThousand * 3);
    }, 0);

    return Number((totalTenThousand / 10000.0).toFixed(2));
  }

  // 純増利益＝売上増分 − 追加コスト
  get netProfitDiff(): number {
    const diff = this.salesDiff - this.totalAdditionalCostCost;
    return Number(diff.toFixed(2));
  }

  getFulfillmentRate(deptKey: DeptKey): number {
    if (!this.scenario || !this.scenario.departments) return 0;
    const dept = this.scenario.departments[deptKey];
    if (!dept) return 0;
    
    const count = dept.count;
    const app = this.dynamicAppropriate[deptKey] || 1;
    return (count / app) * 100;
  }
}