//このファイル名はsrc/app/components/summary.tsです。

import { Component, Input } from '@angular/core';
import { Scenario, Department } from '../../models/scenario.model';

@Component({
  selector: 'app-summary',
  standalone: true,
  templateUrl: './summary.html',
  styleUrl: './summary.css'
})
export class SummaryComponent {

  @Input() scenario: Scenario | null = null;
  @Input() maxSalesScenario: Scenario | null = null;
  @Input() maxProfitScenario: Scenario | null = null;
  @Input() targetSales = 58.0;

  // ★ 総社員数（100〜110名）
  @Input() totalEmployeeCount = 100;

  // ★ 動的スライド後の最低人数（未指定時は100名用初期値）
  @Input() minimumCounts: Record<Department, number> = {
    A: 30,
    B: 20,
    C: 10
  };

  // ★ 動的スライド後の適正人数（未指定時は100名用初期値）
  @Input() appropriateCounts: Record<Department, number> = {
    A: 40,
    B: 35,
    C: 25
  };

  // 100名時の初期基準値（差分表示用）
  private defaultMinimumCounts: Record<Department, number> = { A: 30, B: 20, C: 10 };
  private defaultAppropriateCounts: Record<Department, number> = { A: 40, B: 35, C: 25 };

  // 追加採用人数（例: 110名なら 10名）
  get addedEmployeeCount(): number {
    return Math.max(0, this.totalEmployeeCount - 100);
  }

  // 最低人数の増分差分を取得（例: "+3"）
  getMinCountDiff(dept: Department): string {
    const current = this.minimumCounts[dept] || this.defaultMinimumCounts[dept];
    const diff = current - this.defaultMinimumCounts[dept];
    return diff > 0 ? ` (+${diff})` : '';
  }

  // 適正人数の増分差分を取得（例: "+4"）
  getAppCountDiff(dept: Department): string {
    const current = this.appropriateCounts[dept] || this.defaultAppropriateCounts[dept];
    const diff = current - this.defaultAppropriateCounts[dept];
    return diff > 0 ? ` (+${diff})` : '';
  }
}