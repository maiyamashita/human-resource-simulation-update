import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Scenario } from '../../models/scenario.model';

@Component({
  selector: 'app-scenario-comparison',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scenario-comparison.html',
  styleUrl: './scenario-comparison.css'
})
export class ScenarioComparisonComponent {

  @Input() scenarios: Scenario[] = [];
  
  // 100名標準時の基準データ（前後比較用）
  @Input() base100Scenarios: Scenario[] = [];

  @Input() selectedScenarioId = 1;
  @Input() targetSales = 58.0;      // 目標売上（リアルタイム入力値）
  @Input() employeeCount = 100;     // 現状の人数

  @Output() selectScenario = new EventEmitter<number>();
  @Output() navigateToAdoption = new EventEmitter<void>(); // タブ4への誘導用

  onSelectScenario(id: number): void {
    this.selectScenario.emit(id);
  }

  // ★ 全社利益率(%)を安全に算出するヘルパーメソッド
  getProfitMargin(scenario: Scenario): string {
    if (!scenario || !scenario.totalSales || scenario.totalSales === 0) {
      return '0.0';
    }
    const profit = scenario.totalProfit || 0;
    const margin = (profit / scenario.totalSales) * 100;
    return margin.toFixed(1);
  }

  // 追加採用適用中かどうか（100名より多い場合）
  get isAdoptionApplied(): boolean {
    return this.employeeCount > 100;
  }

  // 追加採用人数
  get adoptionCount(): number {
    return Math.max(0, this.employeeCount - 100);
  }

  // 100名標準時の同IDシナリオを取得
  getBase100Scenario(id: number): Scenario | undefined {
    return (this.base100Scenarios || []).find(s => s && s.id === id);
  }

  // 追加採用による売上純増額（差分）算出
  getSalesDiff(scenario: Scenario): number {
    if (!this.isAdoptionApplied || !scenario || scenario.totalSales === undefined) return 0;
    const baseScenario = this.getBase100Scenario(scenario.id);
    if (!baseScenario || baseScenario.totalSales === undefined) return 0;

    return Number((scenario.totalSales - baseScenario.totalSales).toFixed(2));
  }

  // 追加採用による利益純増額（差分）算出
  getProfitDiff(scenario: Scenario): number {
    if (!this.isAdoptionApplied || !scenario || scenario.totalProfit === undefined) return 0;
    const baseScenario = this.getBase100Scenario(scenario.id);
    if (!baseScenario || baseScenario.totalProfit === undefined) return 0;

    return Number((scenario.totalProfit - baseScenario.totalProfit).toFixed(2));
  }

  // 達成判定
  isTargetAchieved(scenario: Scenario): boolean {
    if (!scenario || scenario.totalSales === undefined) return false;
    return scenario.totalSales >= this.targetSales;
  }

  // ギャップ（不足額）算出
  getSalesGap(scenario: Scenario): number {
    if (!scenario || scenario.totalSales === undefined) return this.targetSales;
    return this.targetSales - scenario.totalSales;
  }

  // 不足額から「必要な追加人材と人数」をリアルタイム逆算するロジック
  getRequiredAdoptionInfo(scenario: Scenario): { count: number; skill: string } {
    const gap = this.getSalesGap(scenario);
    if (gap <= 0) return { count: 0, skill: '' };

    const salesPerEmployee = 1.5; 
    const requiredCount = Math.ceil(gap / salesPerEmployee);

    return {
      count: requiredCount,
      skill: '営業スキル70以上'
    };
  }
}