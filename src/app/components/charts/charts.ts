import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Scenario, Department } from '../../models/scenario.model';
import { Employee } from '../../models/employee.model';

export interface DepartmentYearlySales {
  A: number;
  B: number;
  C: number;
  total: number;
}

export interface YearlyForecast {
  year: number;
  deptSales: DepartmentYearlySales;
  totalProfit: number;
}

export interface Scenario5YearPlan {
  scenarioId: number;
  scenarioName: string;
  forecasts: YearlyForecast[];
  cumulativeSales: number;
  cumulativeProfit: number;
}

@Component({
  selector: 'app-charts',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './charts.html',
  styleUrl: './charts.css'
})
export class ChartsComponent {
  @Input() scenarios: Scenario[] = [];
  @Input() employees: Employee[] = [];
  @Input() targetSales = 58.0;
  @Input() showForecastOnly = false;
  @Input() selectedScenarioId = 1;

  private readonly BASE_GROWTH_RATES: Record<Department, number> = {
    A: 0.02,
    B: 0.08,
    C: 0.20
  };

  formatVal(val: number | undefined | null): string {
    if (val === undefined || val === null || isNaN(val)) {
      return '0.00';
    }
    return val.toFixed(2);
  }

  // 縦向き売上グラフの高さ計算（差分強調）
  getSalesColumnHeight(scenario: Scenario): number {
    if (!this.scenarios || this.scenarios.length === 0 || !scenario || typeof scenario.totalSales !== 'number') return 0;
    
    const salesList = this.scenarios.map(s => s.totalSales || 0);
    const minSales = Math.min(...salesList) * 0.95;
    const maxSales = Math.max(...salesList, this.targetSales) * 1.05;

    if (maxSales === minSales) return 50;

    const heightPercent = ((scenario.totalSales - minSales) / (maxSales - minSales)) * 100;
    return Math.min(Math.max(heightPercent, 20), 100);
  }

  // 縦向き利益グラフの高さ計算（差分強調）
  getProfitColumnHeight(scenario: Scenario): number {
    if (!this.scenarios || this.scenarios.length === 0 || !scenario || typeof scenario.totalProfit !== 'number') return 0;

    const profitList = this.scenarios.map(s => s.totalProfit || 0);
    const minProfit = Math.min(...profitList) * 0.90;
    const maxProfit = Math.max(...profitList) * 1.05;

    if (maxProfit === minProfit) return 50;

    const heightPercent = ((scenario.totalProfit - minProfit) / (maxProfit - minProfit)) * 100;
    return Math.min(Math.max(heightPercent, 20), 100);
  }

  // 目標ラインの表示高さ位置計算
  get TargetSalesHeightPercent(): number {
    if (!this.scenarios || this.scenarios.length === 0) return 80;
    
    const salesList = this.scenarios.map(s => s.totalSales || 0);
    const minSales = Math.min(...salesList) * 0.95;
    const maxSales = Math.max(...salesList, this.targetSales) * 1.05;

    if (maxSales === minSales) return 80;

    return ((this.targetSales - minSales) / (maxSales - minSales)) * 100;
  }

  private getDeptAvgTrainingPower(scenario: Scenario, dept: Department): number {
    if (!scenario.assignment || !scenario.assignment[dept] || !this.employees || !this.employees.length) {
      return 60;
    }

    const assignedIds = scenario.assignment[dept];
    const assignedEmps = this.employees.filter(e => assignedIds.includes(e.id || (e as any).employee_id));

    if (assignedEmps.length === 0) return 60;

    const sumTraining = assignedEmps.reduce((sum, emp) => {
      const e = emp as any;
      return sum + (emp.trainingAbility ?? e.training_ability ?? e.training ?? 60);
    }, 0);

    return sumTraining / assignedEmps.length;
  }

  // 目標売上ラインの底面からの位置（%）
  getTargetSalesHeightPercent(): number {
    if (!this.scenarios || this.scenarios.length === 0) return 30;
    
    const salesList = this.scenarios.map(s => s.totalSales || 0);
    const minSales = Math.min(...salesList) * 0.95;
    const maxSales = Math.max(...salesList, this.targetSales) * 1.05;

    if (maxSales === minSales) return 30;

    const percent = ((this.targetSales - minSales) / (maxSales - minSales)) * 100;
    // 底面（文字）に被らないよう、最低15%の高さを確保
    return Math.max(percent, 15);
  }

  get fiveYearPlans(): Scenario5YearPlan[] {
    if (!this.scenarios || this.scenarios.length === 0) return [];

    return this.scenarios.map(sc => {
      const depts = sc.departments;
      
      let currentDeptSales = {
        A: depts?.['A']?.sales || 0,
        B: depts?.['B']?.sales || 0,
        C: depts?.['C']?.sales || 0
      };

      const growthRates: Record<Department, number> = {
        A: this.BASE_GROWTH_RATES.A + (this.getDeptAvgTrainingPower(sc, 'A') / 100) * 0.05,
        B: this.BASE_GROWTH_RATES.B + (this.getDeptAvgTrainingPower(sc, 'B') / 100) * 0.05,
        C: this.BASE_GROWTH_RATES.C + (this.getDeptAvgTrainingPower(sc, 'C') / 100) * 0.05
      };

      const forecasts: YearlyForecast[] = [];
      let currentProfit = sc.totalProfit || 0;
      let cumSales = 0;
      let cumProfit = 0;

      for (let year = 1; year <= 5; year++) {
        if (year === 1) {
          const total1 = currentDeptSales.A + currentDeptSales.B + currentDeptSales.C;
          forecasts.push({
            year: 1,
            deptSales: { ...currentDeptSales, total: total1 },
            totalProfit: currentProfit
          });
          cumSales += total1;
          cumProfit += currentProfit;
        } else {
          currentDeptSales.A = currentDeptSales.A * (1 + growthRates.A);
          currentDeptSales.B = currentDeptSales.B * (1 + growthRates.B);
          currentDeptSales.C = currentDeptSales.C * (1 + growthRates.C);

          const totalSales = currentDeptSales.A + currentDeptSales.B + currentDeptSales.C;
          const salesDiff = totalSales - forecasts[year - 2].deptSales.total;
          
          currentProfit = currentProfit + salesDiff;

          forecasts.push({
            year,
            deptSales: {
              A: Number(currentDeptSales.A.toFixed(2)),
              B: Number(currentDeptSales.B.toFixed(2)),
              C: Number(currentDeptSales.C.toFixed(2)),
              total: Number(totalSales.toFixed(2))
            },
            totalProfit: Number(currentProfit.toFixed(2))
          });

          cumSales += totalSales;
          cumProfit += currentProfit;
        }
      }

      return {
        scenarioId: sc.id,
        scenarioName: sc.shortName || sc.name,
        forecasts,
        cumulativeSales: Number(cumSales.toFixed(2)),
        cumulativeProfit: Number(cumProfit.toFixed(2))
      };
    });
  }

  get maxForecastSales(): number {
    const plans = this.fiveYearPlans;
    if (!plans || plans.length === 0) return 100;

    let max = 0;
    plans.forEach(p => {
      p.forecasts.forEach(f => {
        if (f.deptSales.total > max) max = f.deptSales.total;
      });
    });
    return max > 0 ? max : 100;
  }
}