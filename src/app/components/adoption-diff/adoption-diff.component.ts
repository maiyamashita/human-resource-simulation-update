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
          <!-- 未試算ガイド表示（ゆったり仕様） -->
          <div class="placeholder-guide-box">
            <div class="guide-inner">
              <strong class="guide-title">追加採用シミュレーション未実行</strong>
              <p class="guide-desc">
                右側で条件や採用人数を設定し、<strong>「この条件で再シミュレーションを実行」</strong> ボタンをクリックしてください。<br>
                試算実行後、全社売上増分・追加コスト・純増利益のインパクトがここに反映されます。
              </p>
            </div>
          </div>
        }

      </div>
    </section>
  `,
  styles: [`
    .diff-section { margin-bottom: 0; }
    .diff-card {
      background: #ffffff; border: 1px solid #cbd5e1; border-radius: 8px;
      padding: 14px 16px; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.03);
      display: flex; flex-direction: column; gap: 12px; min-height: 240px;
    }

    .diff-header { display: flex; justify-content: space-between; align-items: flex-start; }
    .diff-badge { font-size: 0.72rem; font-weight: 800; color: #1d4ed8; }
    .diff-header h3 { margin: 2px 0 2px 0; font-size: 1rem; font-weight: 800; color: #0f172a; }
    .diff-sub { font-size: 0.75rem; color: #64748b; margin: 0; }

    .status-pill {
      font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 4px;
      background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1;
    }
    .status-pill.active { background: #f0fdf4; color: #15803d; border-color: #bbf7d0; }

    /* 未試算ガイド表示 */
    .placeholder-guide-box {
      flex: 1; display: flex; align-items: center; justify-content: center;
      background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 6px; padding: 24px;
      text-align: center;
    }
    .guide-inner { max-width: 480px; margin: 0 auto; }
    .guide-title { font-size: 0.92rem; font-weight: 800; color: #0f172a; display: block; margin-bottom: 8px; }
    .guide-desc { font-size: 0.82rem; color: #475569; margin: 0; line-height: 1.6; }

    .diff-kpi-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .kpi-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; display: flex; flex-direction: column; }
    .kpi-box.highlight { background: #f0fdf4; border-color: #bbf7d0; }
    .kpi-box.negative-box { background: #fef2f2; border-color: #fca5a5; }

    .kpi-label { font-size: 0.72rem; color: #475569; font-weight: 700; }
    .kpi-val-group { display: flex; align-items: baseline; gap: 6px; margin: 4px 0; }
    .kpi-value { font-size: 1.1rem; font-weight: 800; color: #0f172a; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    .kpi-value.warning { color: #c2410c; }
    .kpi-value.negative { color: #dc2626; }

    .diff-tag.cost { font-size: 0.68rem; font-weight: 700; background: #fff7ed; color: #c2410c; padding: 1px 5px; border-radius: 3px; }
    .kpi-note { font-size: 0.68rem; color: #94a3b8; }

    .dept-diff-table-container h4 { margin: 0 0 8px 0; font-size: 0.85rem; font-weight: 800; color: #0f172a; }
    .diff-table { width: 100%; border-collapse: collapse; font-size: 0.78rem; }
    .diff-table th, .diff-table td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }
    .diff-table th { background: #f8fafc; color: #475569; font-weight: 700; }

    .count-badge { background: #eff6ff; color: #1d4ed8; font-weight: 700; padding: 2px 6px; border-radius: 3px; font-size: 0.75rem; }
    .rate-bar-wrapper { display: flex; align-items: center; gap: 6px; width: 110px; }
    .rate-bar { height: 6px; background: #2563eb; border-radius: 3px; }
    .rate-text { font-size: 0.72rem; font-weight: 700; color: #334155; }
  `]
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