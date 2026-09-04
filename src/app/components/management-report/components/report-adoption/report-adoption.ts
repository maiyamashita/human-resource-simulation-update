// src/app/components/management-report/components/report-adoption/report-adoption.ts

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AdoptionSnapshot } from '../../../adoption-view/adoption-view.component';

@Component({
  selector: 'app-report-adoption',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-adoption.html',
  styleUrl: './report-adoption.css'
})
export class ReportAdoptionComponent {
  @Input() snapshot: AdoptionSnapshot | null = null;
  @Input() targetSales = 58.0;

  // 想定年間人件費コスト試算（平均年収600万円 × 3倍ルール = 1人あたり1,800万円/年）
  get estimatedCost(): number {
    if (!this.snapshot) return 0;
    return (this.snapshot.candidateCount * 1800) / 10000; // 億円単位
  }

  // 純増売上（億円）
  get salesImpact(): number {
    return this.snapshot?.salesDiff || 0;
  }

  // 純増利益（億円）
  get profitImpact(): number {
    return this.snapshot?.profitDiff || 0;
  }

  // 投資回収見込み（月数）
  get paybackMonths(): number {
    if (this.profitImpact <= 0 || this.estimatedCost <= 0) return 0;
    const monthlyProfit = (this.profitImpact * 10000) / 12; // 万円/月
    const totalCost = this.estimatedCost * 10000; // 万円
    return Math.ceil(totalCost / monthlyProfit);
  }
}