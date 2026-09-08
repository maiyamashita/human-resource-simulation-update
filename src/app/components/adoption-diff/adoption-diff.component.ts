import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Scenario } from '../../models/scenario.model';
import { CandidateEmployee } from '../adoption-control/adoption-control.component';

type DeptKey = 'A' | 'B' | 'C';

@Component({
  selector: 'app-adoption-diff',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="diff-section">
      <div class="diff-card">
        
        <div class="diff-header">
          <div>
            <span class="diff-badge">追加採用 改善効果分析</span>
            <h3>通常100名 vs 追加採用 (+{{ candidates.length || 10 }}名) の効果比較</h3>
            <p class="diff-sub">選択中: {{ scenario?.name || 'シナリオ1' }}</p>
          </div>

          <div class="status-pill" [class.active]="hasCalculatedResult">
            <span>{{ hasCalculatedResult ? '試算結果 適用中' : '未試算（条件設定中）' }}</span>
          </div>
        </div>

        @if (hasCalculatedResult) {
          <div class="diff-kpi-grid">
            <div class="kpi-box">
              <span class="kpi-label">売上増分 (対 通常100名)</span>
              <div class="kpi-val-group">
                <strong class="kpi-value" [class.negative]="salesDiff < 0">
                  {{ salesDiff >= 0 ? '+' : '' }}{{ salesDiff | number:'1.2-2' }} 億円
                </strong>
              </div>
              <small class="kpi-note">100名体制時点との全社売上差分</small>
            </div>

            <div class="kpi-box">
              <span class="kpi-label">追加人件費コスト</span>
              <div class="kpi-val-group">
                <strong class="kpi-value warning">-{{ totalAdditionalCostCost | number:'1.2-2' }} 億円</strong>
                <span class="diff-tag cost">+{{ candidates.length }}名分</span>
              </div>
              <small class="kpi-note">給与・福利厚生・管理費込 (3倍算定)</small>
            </div>

            <div class="kpi-box highlight" [class.negative-box]="netProfitDiff < 0">
              <span class="kpi-label">純増利益 (改善効果)</span>
              <div class="kpi-val-group">
                <strong class="kpi-value" [class.negative]="netProfitDiff < 0">
                  {{ netProfitDiff >= 0 ? '+' : '' }}{{ netProfitDiff | number:'1.2-2' }} 億円
                </strong>
              </div>
              <small class="kpi-note">売上増分 － 追加人件費コスト</small>
            </div>
          </div>

          @if (scenario) {
            <div class="dept-diff-table-container">
              <h4>事業部別の最適配置と充足率スライド</h4>
              <table class="diff-table">
                <thead>
                  <tr>
                    <th>事業部</th>
                    <th>配置人数</th>
                    <th>適正基準</th>
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
                      <td>{{ scenario?.appropriateCounts?.[deptKey] ?? 0 }} 名</td>
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
        } @else {
          <!-- 【デザイン改善】未試算ガイド表示（モダンカード化） -->
          <div class="placeholder-guide-box">
            <div class="guide-inner">
              <div class="guide-icon">📊</div>
              <strong class="guide-title">追加採用シミュレーション未実行</strong>
              <p class="guide-desc">
                右側で条件や採用人数を設定し、<span class="highlight-btn-text">「この条件で再シミュレーションを実行」</span> ボタンをクリックしてください。<br>
                試算実行後、全社売上増分・追加コスト・純増利益のインパクトがここに反映されます。
              </p>
            </div>
          </div>
        }

      </div>
    </section>
  `,
  styleUrl: './adoption-diff.component.css'
})
export class AdoptionDiffComponent {
  @Input() mode: 'standard' | 'adoption' = 'standard';
  @Input() scenario: Scenario | null = null;
  @Input() baseScenario: Scenario | null = null;
  @Input() candidates: CandidateEmployee[] = [];

  readonly deptList: DeptKey[] = ['A', 'B', 'C'];

  get hasCalculatedResult(): boolean {
    if (this.mode !== 'adoption' || !this.scenario || !this.baseScenario || !this.candidates || this.candidates.length === 0) {
      return false;
    }
    return (this.scenario as any).isAdoptionResult === true;
  }

  get salesDiff(): number {
    if (!this.scenario || !this.baseScenario) return 0;
    const diff = (this.scenario.totalSales || 0) - (this.baseScenario.totalSales || 0);
    return Number(diff.toFixed(2));
  }

  get totalAdditionalCostCost(): number {
    if (!this.scenario || !this.baseScenario) return 0;
    const currentCost = (this.scenario.totalSales || 0) - (this.scenario.totalProfit || 0);
    const baseCost = (this.baseScenario.totalSales || 0) - (this.baseScenario.totalProfit || 0);
    return Number((currentCost - baseCost).toFixed(2));
  }

  get netProfitDiff(): number {
    const diff = this.salesDiff - this.totalAdditionalCostCost;
    return Number(diff.toFixed(2));
  }

  getFulfillmentRate(deptKey: DeptKey): number {
    if (!this.scenario || !this.scenario.departments) return 0;
    const dept = this.scenario.departments[deptKey];
    if (!dept) return 0;
    const count = dept.count;
    const app = this.scenario.appropriateCounts?.[deptKey] || 1;
    return (count / app) * 100;
  }
}