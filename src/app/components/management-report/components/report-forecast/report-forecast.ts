// src/app/components/management-report/components/report-forecast/report-forecast.ts

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Scenario } from '../../../../models/scenario.model';
import { Employee } from '../../../../models/employee.model';
import { AdoptionSnapshot } from '../../../adoption-view/adoption-view.component';

interface YearlyForecastDetail {
  year: number;
  label: string;
  baseSales: number;
  adoptionSales: number;
  impact: number;
}

interface FiveYearPlan {
  scenarioId: number;
  scenarioName: string;
  forecasts: YearlyForecastDetail[];
  cumulativeSalesBase: number;
  cumulativeSalesAdoption: number;
  cumulativeProfitBase: number;
  cumulativeProfitAdoption: number;
  isPrimary: boolean;
  isSecondary: boolean;
}

@Component({
  selector: 'app-report-forecast',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-forecast.html',
  styleUrl: './report-forecast.css'
})
export class ReportForecastComponent {
  @Input() validScenarios: Scenario[] = [];
  @Input() employees: Employee[] = [];
  @Input() snapshot: AdoptionSnapshot | null = null;
  @Input() primaryScenarioId = 1;
  @Input() secondaryScenarioId = 4;
  @Input() targetSales = 58.0; // 前期実績・基準目標

  // --------------------------------------------------
  // 5か年予測プランデータ算定（Year 0: 前期実績 58.0億を起点に追加）
  // --------------------------------------------------
  get fiveYearPlans(): FiveYearPlan[] {
    if (!this.validScenarios || this.validScenarios.length === 0) return [];

    const annualImpact = this.snapshot?.salesDiff || 0;
    const annualProfitImpact = this.snapshot?.profitDiff || 0;

    return this.validScenarios.map(sc => {
      const initialSales = sc.totalSales || 50.0;
      const initialProfit = sc.totalProfit || 10.0;

      const forecasts: YearlyForecastDetail[] = [];
      
      // ★ Year 0 (前期実績) を起点として追加
      forecasts.push({
        year: 0,
        label: 'Year 0 (実績)',
        baseSales: this.targetSales,
        adoptionSales: this.targetSales,
        impact: 0
      });

      let cumulativeSalesBase = 0;
      let cumulativeSalesAdoption = 0;

      for (let i = 1; i <= 5; i++) {
        const growthFactor = Math.pow(1.03, i - 1);
        const baseSales = Number((initialSales * growthFactor).toFixed(1));

        const proficiencyFactor = i === 1 ? 0.7 : 1.0 + (i - 2) * 0.08;
        const impact = Number((annualImpact * proficiencyFactor).toFixed(1));
        const adoptionSales = Number((baseSales + impact).toFixed(1));

        forecasts.push({
          year: i,
          label: `Year ${i}`,
          baseSales,
          adoptionSales: this.snapshot ? adoptionSales : baseSales,
          impact: this.snapshot ? impact : 0
        });

        cumulativeSalesBase += baseSales;
        cumulativeSalesAdoption += adoptionSales;
      }

      const cumulativeProfitBase = Number((initialProfit * 5.3).toFixed(1));
      const cumulativeProfitAdoption = Number((cumulativeProfitBase + annualProfitImpact * 5).toFixed(1));

      return {
        scenarioId: sc.id,
        scenarioName: `S${sc.id}: ${sc.shortName || sc.name}`,
        forecasts,
        cumulativeSalesBase: Number(cumulativeSalesBase.toFixed(1)),
        cumulativeSalesAdoption: Number(cumulativeSalesAdoption.toFixed(1)),
        cumulativeProfitBase,
        cumulativeProfitAdoption,
        isPrimary: sc.id === this.primaryScenarioId,
        isSecondary: sc.id === this.secondaryScenarioId
      };
    });
  }

  // --------------------------------------------------
  // SVG座標計算スケール（Year 0〜5 の計6ポイント対応）
  // --------------------------------------------------
  get allSalesValues(): number[] {
    const vals: number[] = [this.targetSales];
    this.fiveYearPlans.forEach(p => {
      p.forecasts.forEach(f => {
        vals.push(f.baseSales);
        if (this.snapshot) vals.push(f.adoptionSales);
      });
    });
    return vals;
  }

  get maxForecastSales(): number {
    const max = Math.max(...this.allSalesValues);
    return Math.ceil(max / 5) * 5 + 5;
  }

  get minForecastSales(): number {
    const min = Math.min(...this.allSalesValues);
    return Math.max(0, Math.floor(min / 5) * 5 - 5);
  }

  get forecastYAxisStep(): number {
    return (this.maxForecastSales - this.minForecastSales) / 4;
  }

  // 6ポイント (0〜5) を横幅に均等配置
  getForecastXCoord(yearIndex: number): number {
    return 40 + yearIndex * 85; // 0: 40, 1: 125, 2: 210, 3: 295, 4: 380, 5: 465
  }

  getForecastYCoord(sales: number): number {
    const range = this.maxForecastSales - this.minForecastSales;
    if (range <= 0) return 90;
    const ratio = (sales - this.minForecastSales) / range;
    return 170 - ratio * 150;
  }

  // 標準線座標（Year 0〜5）
  getScenarioBaseLinePoints(plan: FiveYearPlan): string {
    return plan.forecasts
      .map((f, i) => `${this.getForecastXCoord(i)},${this.getForecastYCoord(f.baseSales)}`)
      .join(' ');
  }

  // 追加採用後座標（Year 0〜5）
  getScenarioAdoptionLinePoints(plan: FiveYearPlan): string {
    return plan.forecasts
      .map((f, i) => `${this.getForecastXCoord(i)},${this.getForecastYCoord(f.adoptionSales)}`)
      .join(' ');
  }
}