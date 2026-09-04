// src/app/components/management-report/components/report-overview/report-overview.ts

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Scenario, Department } from '../../../../models/scenario.model';
import { AdoptionSnapshot } from '../../../adoption-view/adoption-view.component';

@Component({
  selector: 'app-report-overview',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-overview.html',
  styleUrl: './report-overview.css'
})
export class ReportOverviewComponent {
  @Input() validScenarios: Scenario[] = [];
  @Input() targetSales = 58.0;

  // 選択中の追加採用スナップショット
  @Input() snapshot: AdoptionSnapshot | null = null;

  // 親から受け取る候補シナリオID
  @Input() primaryScenarioId = 1;
  @Input() secondaryScenarioId = 4;

  get primaryScenario(): Scenario | undefined {
    return this.validScenarios.find(s => s.id === this.primaryScenarioId) || this.validScenarios[0];
  }

  getScenarioName(scenario: Scenario): string {
    if (!scenario) return '';
    const id = scenario.id;
    if (id === 1) return 'S1：全社売上最大';
    if (id === 2) return 'S2：A利益最大';
    if (id === 3) return 'S3：B売上最大';
    if (id === 4) return 'S4：C売上最大';
    return scenario.shortName || scenario.name || `S${id}`;
  }

  getScenarioSales(scenario: Scenario): number { return scenario?.totalSales ?? 0; }
  getScenarioProfit(scenario: Scenario): number { return scenario?.totalProfit ?? 0; }
  getDepartmentSales(scenario: Scenario, dept: Department): number { return scenario?.departments?.[dept]?.sales ?? 0; }
  getDepartmentCount(scenario: Scenario, dept: Department): number { return scenario?.departments?.[dept]?.count ?? 0; }

  // 第一候補（推し案）との売上差分算出
  getSalesDiffFromPrimary(scenario: Scenario): number {
    if (!this.primaryScenario || scenario.id === this.primaryScenario.id) return 0;
    return this.getScenarioSales(scenario) - this.getScenarioSales(this.primaryScenario);
  }

  // 追加採用による売上純増インパクト
  getAdoptionSalesImpact(): number {
    return this.snapshot?.salesDiff ?? 0;
  }

  // --------------------------------------------------
  // 左グラフ：総売上比較データ（80億スケールに調整してゆとりを確保）
  // --------------------------------------------------
  get totalSalesChartData() {
    const impact = this.getAdoptionSalesImpact();
    const maxScale = 80;

    return this.validScenarios.map(s => {
      const totalVal = s.totalSales ?? 0;
      const baseVal = this.snapshot ? Math.max(0, totalVal - impact) : totalVal;
      const addVal = this.snapshot ? impact : 0;

      const totalHeightPct = Math.min((totalVal / maxScale) * 100, 100);
      const basePctOfTotal = totalVal > 0 ? (baseVal / totalVal) * 100 : 100;
      const addPctOfTotal = totalVal > 0 ? (addVal / totalVal) * 100 : 0;

      return {
        id: s.id,
        label: this.getScenarioName(s),
        totalValue: totalVal,
        baseValue: baseVal,
        addValue: addVal,
        totalHeightPct,
        basePctOfTotal,
        addPctOfTotal,
        isPrimary: s.id === this.primaryScenarioId,
        isSecondary: s.id === this.secondaryScenarioId
      };
    });
  }

  // --------------------------------------------------
  // 右グラフ：部門別売上比較データ（40億スケールで高さ連動）
  // --------------------------------------------------
  getDepartmentSalesData(scenario: Scenario, dept: Department): { total: number; base: number; add: number } {
    const total = this.getDepartmentSales(scenario, dept);
    if (!this.snapshot) {
      return { total, base: total, add: 0 };
    }

    const candidatesInDept = this.snapshot.candidates.filter((c: any) => c.department === dept).length;
    const totalCandidates = this.snapshot.candidates.length || 1;
    
    const deptImpact = candidatesInDept > 0 
      ? (this.getAdoptionSalesImpact() * candidatesInDept) / totalCandidates
      : (this.getAdoptionSalesImpact() * (total / (scenario.totalSales || 1)));

    const base = Math.max(0, total - deptImpact);
    return {
      total,
      base: Number(base.toFixed(1)),
      add: Number((total - base).toFixed(1))
    };
  }

  getDeptSalesBarHeight(sales: number): number { 
    return Math.min((sales / 40) * 100, 100);
  }

  isTargetAchieved(scenario: Scenario): boolean { return this.getScenarioSales(scenario) > this.targetSales; }
  getTotalAssignedCount(scenario: Scenario): number {
    return this.getDepartmentCount(scenario, 'A') + this.getDepartmentCount(scenario, 'B') + this.getDepartmentCount(scenario, 'C');
  }
}