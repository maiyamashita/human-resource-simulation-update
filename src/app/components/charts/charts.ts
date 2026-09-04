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
  cumulativeSalesDiff?: number;
  cumulativeProfitDiff?: number;
  cagr?: string;
  growthRate?: string;
}

export interface SvgPoint {
  x: number;
  y: number;
  val: number;
  year: number;
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
  @Input() base100Scenarios: Scenario[] = [];
  @Input() employees: Employee[] = [];
  @Input() targetSales = 58.0;
  @Input() showForecastOnly = false;
  @Input() selectedScenarioId = 1;
  @Input() employeeCount = 100;

  // 対案選択プロパティ（0 = 比較なし）
  compareScenarioId = 0;

  private readonly BASE_GROWTH_RATES: Record<Department, number> = {
    A: 0.02,
    B: 0.08,
    C: 0.20
  };

  get isAdoptionApplied(): boolean {
    return this.employeeCount > 100;
  }

  get adoptionCount(): number {
    return Math.max(0, this.employeeCount - 100);
  }

  getBase100Scenario(id: number): Scenario | undefined {
    return (this.base100Scenarios || []).find(s => s && s.id === id);
  }

  get selectedScenario(): Scenario | undefined {
    return (this.scenarios || []).find(s => s?.id === this.selectedScenarioId);
  }

  get compareScenario(): Scenario | undefined {
    if (!this.compareScenarioId || this.compareScenarioId === this.selectedScenarioId) return undefined;
    return (this.scenarios || []).find(s => s?.id === this.compareScenarioId);
  }

  onCompareScenarioChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.compareScenarioId = Number(val);
  }

  getProfitMargin(scenario: Scenario): string {
    if (!scenario || !scenario.totalSales || scenario.totalSales === 0) {
      return '0.0';
    }
    const profit = scenario.totalProfit || 0;
    const margin = (profit / scenario.totalSales) * 100;
    return margin.toFixed(1);
  }

  getDeptBaseProfitMargin(scenario: Scenario, dept: Department): string {
    const sales = this.getDeptBaseSales(scenario, dept);
    const profit = this.getDeptBaseProfit(scenario, dept);

    if (!sales || sales === 0) return '0.0';
    const margin = (profit / sales) * 100;
    return margin.toFixed(1);
  }

  getDeptDiffProfitMargin(scenario: Scenario, dept: Department): string {
    const diffSales = this.getDeptDiffSales(scenario, dept);
    const diffProfit = this.getDeptDiffProfit(scenario, dept);

    if (!diffSales || diffSales === 0) return '0.0';
    const margin = (diffProfit / diffSales) * 100;
    return margin.toFixed(1);
  }

  getAbsSalesDiffFromSelected(scenario: Scenario): string {
    if (!scenario || scenario.id === this.selectedScenarioId || !scenario.totalSales) return '0.00';
    const baseSales = this.selectedScenario?.totalSales || 0;
    const diff = scenario.totalSales - baseSales;
    return Math.abs(diff).toFixed(2);
  }

  isSalesPlusFromSelected(scenario: Scenario): boolean {
    if (!scenario || !scenario.totalSales) return false;
    const baseSales = this.selectedScenario?.totalSales || 0;
    return scenario.totalSales >= baseSales;
  }

  formatVal(val: number | undefined | null): string {
    if (val === undefined || val === null || isNaN(val)) {
      return '0.00';
    }
    return val.toFixed(2);
  }

  get maxSalesScale(): number {
    const allSales = (this.scenarios || []).map(s => s?.totalSales || 0);
    const maxVal = Math.max(...allSales, this.targetSales, 10);
    return maxVal * 1.12;
  }

  getDeptBaseSalesWidth(scenario: Scenario, dept: Department): number {
    if (!scenario) return 0;
    if (this.isAdoptionApplied) {
      const baseSc = this.getBase100Scenario(scenario.id);
      if (baseSc && baseSc.departments && baseSc.departments[dept]) {
        return ((baseSc.departments[dept].sales || 0) / this.maxSalesScale) * 100;
      }
    }
    const sales = scenario.departments?.[dept]?.sales || 0;
    return (sales / this.maxSalesScale) * 100;
  }

  getDeptDiffSalesWidth(scenario: Scenario, dept: Department): number {
    if (!this.isAdoptionApplied || !scenario) return 0;
    const baseSc = this.getBase100Scenario(scenario.id);
    if (!baseSc || !baseSc.departments || !baseSc.departments[dept]) return 0;

    const currentSales = scenario.departments?.[dept]?.sales || 0;
    const baseSales = baseSc.departments[dept].sales || 0;
    const diff = Math.max(0, currentSales - baseSales);

    return (diff / this.maxSalesScale) * 100;
  }

  getDeptBaseSales(scenario: Scenario, dept: Department): number {
    if (this.isAdoptionApplied) {
      const baseSc = this.getBase100Scenario(scenario.id);
      if (baseSc && baseSc.departments && baseSc.departments[dept]) {
        return baseSc.departments[dept].sales || 0;
      }
    }
    return scenario.departments?.[dept]?.sales || 0;
  }

  getDeptDiffSales(scenario: Scenario, dept: Department): number {
    if (!this.isAdoptionApplied) return 0;
    const baseSales = this.getDeptBaseSales(scenario, dept);
    const currentSales = scenario.departments?.[dept]?.sales || 0;
    return Number(Math.max(0, currentSales - baseSales).toFixed(2));
  }

  getDeptBaseProfit(scenario: Scenario, dept: Department): number {
    if (this.isAdoptionApplied) {
      const baseSc = this.getBase100Scenario(scenario.id);
      if (baseSc && baseSc.departments && baseSc.departments[dept]) {
        return baseSc.departments[dept].profit || 0;
      }
    }
    return scenario.departments?.[dept]?.profit || 0;
  }

  getDeptDiffProfit(scenario: Scenario, dept: Department): number {
    if (!this.isAdoptionApplied) return 0;
    const baseProfit = this.getDeptBaseProfit(scenario, dept);
    const currentProfit = scenario.departments?.[dept]?.profit || 0;
    return Number(Math.max(0, currentProfit - baseProfit).toFixed(2));
  }

  getDeptBaseEmployeeCount(scenario: Scenario, dept: Department): number {
    if (this.isAdoptionApplied) {
      const baseSc = this.getBase100Scenario(scenario.id);
      if (baseSc) return this.getDeptEmployeeCount(baseSc, dept);
    }
    return this.getDeptEmployeeCount(scenario, dept);
  }

  getDeptDiffEmployeeCount(scenario: Scenario, dept: Department): number {
    if (!this.isAdoptionApplied) return 0;
    const baseCount = this.getDeptBaseEmployeeCount(scenario, dept);
    const currentCount = this.getDeptEmployeeCount(scenario, dept);
    return Math.max(0, currentCount - baseCount);
  }

  getDeptEmployeeCount(scenario: Scenario, dept: Department): number {
    if (!scenario) return 0;
    if (scenario.assignment && scenario.assignment[dept]) {
      return scenario.assignment[dept].length;
    }
    const deptData = scenario.departments?.[dept] as any;
    if (deptData) {
      if (typeof deptData.employeeCount === 'number') return deptData.employeeCount;
      if (Array.isArray(deptData.assignedEmployees)) return deptData.assignedEmployees.length;
      if (Array.isArray(deptData.employees)) return deptData.employees.length;
    }
    return 0;
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

  private calculate5YearPlanForScenario(sc: Scenario): { forecasts: YearlyForecast[]; cumulativeSales: number; cumulativeProfit: number } {
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
      forecasts,
      cumulativeSales: Number(cumSales.toFixed(2)),
      cumulativeProfit: Number(cumProfit.toFixed(2))
    };
  }

  get fiveYearPlans(): Scenario5YearPlan[] {
    if (!this.scenarios || this.scenarios.length === 0) return [];

    return this.scenarios.map(sc => {
      const currentPlan = this.calculate5YearPlanForScenario(sc);
      
      let cumulativeSalesDiff = 0;
      let cumulativeProfitDiff = 0;

      if (this.isAdoptionApplied) {
        const baseSc = this.getBase100Scenario(sc.id);
        if (baseSc) {
          const basePlan = this.calculate5YearPlanForScenario(baseSc);
          cumulativeSalesDiff = Number((currentPlan.cumulativeSales - basePlan.cumulativeSales).toFixed(2));
          cumulativeProfitDiff = Number((currentPlan.cumulativeProfit - basePlan.cumulativeProfit).toFixed(2));
        }
      }

      const year5Sales = currentPlan.forecasts[4]?.deptSales.total || 0;
      const cagrVal = Math.pow(year5Sales / this.targetSales, 1 / 5) - 1;
      const cagr = isNaN(cagrVal) ? '+0.0%' : `+${(cagrVal * 100).toFixed(1)}%`;
      
      const growthVal = ((year5Sales - this.targetSales) / this.targetSales) * 100;
      const growthRate = isNaN(growthVal) ? '+0%' : `+${Math.round(growthVal)}%`;

      return {
        scenarioId: sc.id,
        scenarioName: sc.shortName || sc.name,
        forecasts: currentPlan.forecasts,
        cumulativeSales: currentPlan.cumulativeSales,
        cumulativeProfit: currentPlan.cumulativeProfit,
        cumulativeSalesDiff,
        cumulativeProfitDiff,
        cagr,
        growthRate
      };
    });
  }

  get selectedPlan(): Scenario5YearPlan | undefined {
    return this.fiveYearPlans.find(p => p.scenarioId === this.selectedScenarioId) || this.fiveYearPlans[0];
  }

  get selectedBase100Plan(): Scenario5YearPlan | undefined {
    const baseSc = this.getBase100Scenario(this.selectedScenarioId);
    if (!baseSc) return undefined;
    const plan = this.calculate5YearPlanForScenario(baseSc);
    return {
      scenarioId: baseSc.id,
      scenarioName: baseSc.shortName || baseSc.name,
      forecasts: plan.forecasts,
      cumulativeSales: plan.cumulativeSales,
      cumulativeProfit: plan.cumulativeProfit
    };
  }

  get comparePlan(): Scenario5YearPlan | undefined {
    if (!this.compareScenarioId || this.compareScenarioId === this.selectedScenarioId) return undefined;
    return this.fiveYearPlans.find(p => p.scenarioId === this.compareScenarioId);
  }

  get compareBase100Plan(): Scenario5YearPlan | undefined {
    if (!this.compareScenarioId || this.compareScenarioId === this.selectedScenarioId) return undefined;
    const baseSc = this.getBase100Scenario(this.compareScenarioId);
    if (!baseSc) return undefined;
    const plan = this.calculate5YearPlanForScenario(baseSc);
    return {
      scenarioId: baseSc.id,
      scenarioName: baseSc.shortName || baseSc.name,
      forecasts: plan.forecasts,
      cumulativeSales: plan.cumulativeSales,
      cumulativeProfit: plan.cumulativeProfit
    };
  }

  // ★ 縦幅を拡張したSVG折れ線座標計算 ★
  get svgChartHeight(): number { return 250; } // 180 -> 250px へ縦幅拡大
  get svgChartWidth(): number { return 560; }
  get minSalesScale(): number { return 50; }
  get maxSalesTrendScale(): number { return 105; }

  getSvgX(yearIndex: number): number {
    const padding = 45;
    const usableWidth = this.svgChartWidth - padding * 2;
    return padding + (usableWidth / 5) * yearIndex;
  }

  getSvgY(val: number): number {
    const topMargin = 25;
    const bottomMargin = 35;
    const usableHeight = this.svgChartHeight - topMargin - bottomMargin;
    const clamped = Math.max(this.minSalesScale, Math.min(this.maxSalesTrendScale, val));
    const ratio = (clamped - this.minSalesScale) / (this.maxSalesTrendScale - this.minSalesScale);
    return this.svgChartHeight - bottomMargin - (ratio * usableHeight);
  }

  getPointsPath(plan: Scenario5YearPlan | undefined): string {
    if (!plan || !plan.forecasts || plan.forecasts.length === 0) return '';
    let path = `M ${this.getSvgX(0)},${this.getSvgY(this.targetSales)}`;
    plan.forecasts.forEach((f, idx) => {
      path += ` L ${this.getSvgX(idx + 1)},${this.getSvgY(f.deptSales.total)}`;
    });
    return path;
  }

  getPlanPoints(plan: Scenario5YearPlan | undefined): SvgPoint[] {
    if (!plan || !plan.forecasts) return [];
    const pts: SvgPoint[] = [{ x: this.getSvgX(0), y: this.getSvgY(this.targetSales), val: this.targetSales, year: 0 }];
    plan.forecasts.forEach((f, idx) => {
      pts.push({
        x: this.getSvgX(idx + 1),
        y: this.getSvgY(f.deptSales.total),
        val: f.deptSales.total,
        year: f.year
      });
    });
    return pts;
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