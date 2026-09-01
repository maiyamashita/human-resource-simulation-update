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
  @Input() selectedScenarioId = 1;
  @Input() targetSales = 58.0;      // 目標売上（リアルタイム入力値）
  @Input() employeeCount = 100;     // 現状の人数

  @Output() selectScenario = new EventEmitter<number>();
  @Output() navigateToAdoption = new EventEmitter<void>(); // タブ4への誘導用

  onSelectScenario(id: number): void {
    this.selectScenario.emit(id);
  }

  // ★ 達成判定
  isTargetAchieved(scenario: Scenario): boolean {
    if (!scenario || scenario.totalSales === undefined) return false;
    return scenario.totalSales >= this.targetSales;
  }

  // ★ ギャップ（不足額）算出
  getSalesGap(scenario: Scenario): number {
    if (!scenario || scenario.totalSales === undefined) return this.targetSales;
    return this.targetSales - scenario.totalSales;
  }

  // ★ 不足額から「必要な追加人材と人数」をリアルタイム逆算するロジック
  getRequiredAdoptionInfo(scenario: Scenario): { count: number; skill: string } {
    const gap = this.getSalesGap(scenario);
    if (gap <= 0) return { count: 0, skill: '' };

    // 1名あたりの平均年間売上貢献枠（約1.5億円）で計算
    const salesPerEmployee = 1.5; 
    const requiredCount = Math.ceil(gap / salesPerEmployee);

    return {
      count: requiredCount,
      skill: '営業スキル70以上'
    };
  }
}