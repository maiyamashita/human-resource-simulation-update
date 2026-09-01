import { 
  Component, 
  Input, 
  OnChanges, 
  SimpleChanges, 
  ChangeDetectorRef 
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Scenario, Department } from '../../models/scenario.model';
import { Employee } from '../../models/employee.model';
import { 
  ScenarioDataService, 
  ManualEmployeeInput, 
  RecalculateResponse 
} from '../../services/scenario-data.service';

@Component({
  selector: 'app-scenario-detail',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './scenario-detail.html',
  styleUrl: './scenario-detail.css'
})
export class ScenarioDetailComponent implements OnChanges {

  readonly deptKeys: Department[] = ['A', 'B', 'C'];

  @Input() scenario: Scenario | null = null;
  @Input() employees: Employee[] = [];
  @Input() targetSales = 58.0; // 親（タブ1側）から渡される現在の目標売上値
  @Input() totalEmployeeCount = 100;

  @Input() appropriateCounts: Record<Department, number> = { A: 40, B: 35, C: 25 };
  @Input() minimumCounts: Record<Department, number> = { A: 30, B: 20, C: 10 };

  private defaultAppropriateCounts: Record<Department, number> = { A: 40, B: 35, C: 25 };
  private defaultMinimumCounts: Record<Department, number> = { A: 30, B: 20, C: 10 };

  // 手動調整（What-if）状態管理
  isCustomActive = false;
  customAssignments: Record<Department, string[]> = { A: [], B: [], C: [] };
  customScenarioResult: Scenario | null = null;
  customAlerts: RecalculateResponse['meta']['alerts'] = [];
  isLoading = false;

  selectedEmployeeId: string | null = null;
  selectedFromDept: Department | null = null;

  movedEmployeeIds: Set<string> = new Set<string>();

  constructor(
    private scenarioDataService: ScenarioDataService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['scenario'] && this.isCustomActive) {
      this.resetCustomScenario();
    }
  }

  get activeScenario(): Scenario | null {
    return this.isCustomActive && this.customScenarioResult 
      ? this.customScenarioResult 
      : this.scenario;
  }

  // ★ 全社レベルのプラマイ差分算出 ★
  get totalSalesDiff(): number {
    if (!this.isCustomActive || !this.scenario?.totalSales || !this.customScenarioResult?.totalSales) return 0;
    return this.customScenarioResult.totalSales - this.scenario.totalSales;
  }

  get totalProfitDiff(): number {
    if (!this.isCustomActive || !this.scenario?.totalProfit || !this.customScenarioResult?.totalProfit) return 0;
    return this.customScenarioResult.totalProfit - this.scenario.totalProfit;
  }

  // ★ 事業部レベルの各種プラマイ差分算出 ★
  getDeptCountDiff(dept: Department): number {
    if (!this.isCustomActive || !this.scenario?.departments?.[dept]) return 0;
    const baseCount = this.scenario.departments[dept].count;
    const currentCount = this.customAssignments[dept]?.length || 0;
    return currentCount - baseCount;
  }

  getDeptSalesDiff(dept: Department): number {
    if (!this.isCustomActive || !this.scenario?.departments?.[dept] || !this.customScenarioResult?.departments?.[dept]) return 0;
    return (this.customScenarioResult.departments[dept].sales || 0) - (this.scenario.departments[dept].sales || 0);
  }

  getDeptProfitDiff(dept: Department): number {
    if (!this.isCustomActive || !this.scenario?.departments?.[dept] || !this.customScenarioResult?.departments?.[dept]) return 0;
    return (this.customScenarioResult.departments[dept].profit || 0) - (this.scenario.departments[dept].profit || 0);
  }

  onSelectEmployee(empId: string | number, dept: Department): void {
    const empIdStr = String(empId);

    if (this.selectedEmployeeId === empIdStr) {
      this.clearSelection();
      return;
    }

    this.selectedEmployeeId = empIdStr;
    this.selectedFromDept = dept;
  }

  onMoveToDepartment(targetDept: Department): void {
    if (!this.selectedEmployeeId || !this.selectedFromDept) return;
    if (this.selectedFromDept === targetDept) {
      this.clearSelection();
      return;
    }

    if (!this.isCustomActive) {
      this.customAssignments = {
        A: [...(this.scenario?.assignment?.A || [])],
        B: [...(this.scenario?.assignment?.B || [])],
        C: [...(this.scenario?.assignment?.C || [])]
      };
      this.movedEmployeeIds.clear();
    }

    const empId = this.selectedEmployeeId;
    const fromDept = this.selectedFromDept;

    this.customAssignments[fromDept] = this.customAssignments[fromDept].filter(id => id !== empId);
    this.customAssignments[targetDept].push(empId);

    this.customAssignments[targetDept] = this.sortEmployeeIds(this.customAssignments[targetDept]);

    const originalDept = this.getOriginalDeptOfEmployee(empId);
    if (originalDept !== targetDept) {
      this.movedEmployeeIds.add(empId);
    } else {
      this.movedEmployeeIds.delete(empId);
    }

    this.clearSelection();
    this.recalculateCustomAssignment();
  }

  private sortEmployeeIds(ids: string[]): string[] {
    return [...ids].sort((a, b) => {
      const numA = parseInt(String(a).replace(/[^0-9]/g, ''), 10) || 0;
      const numB = parseInt(String(b).replace(/[^0-9]/g, ''), 10) || 0;
      return numA - numB;
    });
  }

  private getOriginalDeptOfEmployee(empId: string): Department | null {
    if (!this.scenario?.assignment) return null;
    for (const d of this.deptKeys) {
      if (this.scenario.assignment[d]?.includes(empId)) {
        return d;
      }
    }
    return null;
  }

  isEmployeeMoved(empId: string | number): boolean {
    return this.movedEmployeeIds.has(String(empId));
  }

  clearSelection(): void {
    this.selectedEmployeeId = null;
    this.selectedFromDept = null;
  }

  resetCustomScenario(): void {
    this.isCustomActive = false;
    this.customScenarioResult = null;
    this.customAlerts = [];
    this.customAssignments = { A: [], B: [], C: [] };
    this.movedEmployeeIds.clear();
    this.clearSelection();
    this.cdr.detectChanges();
  }

  private recalculateCustomAssignment(): void {
    this.isLoading = true;
    const payload: ManualEmployeeInput[] = [];

    this.deptKeys.forEach(dept => {
      const empIds = this.customAssignments[dept];
      empIds.forEach(id => {
        const emp = this.employees.find(e => {
          const eAny = e as any;
          const targetId = String(e.id || eAny.employee_id || eAny.employeeId || '');
          return targetId === String(id);
        });

        const e = (emp || {}) as any;
        
        const sVal = Number(e.salesAbility ?? e.sales_ability ?? e.sales ?? e.salesPower ?? 60) || 60;
        const mVal = Number(e.managementAbility ?? e.management_ability ?? e.management ?? e.managementPower ?? 60) || 60;
        const dVal = Number(e.developmentAbility ?? e.development_ability ?? e.development ?? e.developmentPower ?? 60) || 60;
        const tVal = Number(e.trainingAbility ?? e.training_ability ?? e.training ?? e.trainingPower ?? 60) || 60;
        const cVal = Number(e.personnelCost ?? e.personnel_cost ?? e.cost ?? 10) || 10;

        payload.push({
          employee_id: String(id),
          sales: sVal,
          management: mVal,
          development: dVal,
          training: tVal,
          personnel_cost: cVal,
          assigned_dept: String(dept)
        });
      });
    });

    // タブ1から渡されている targetSales を引数に渡して手動調整試算（未達アラート用）
    this.scenarioDataService.recalculateManualAssignment(payload, this.targetSales).subscribe({
      next: (res) => {
        this.isCustomActive = true;
        this.customScenarioResult = res.scenario;
        this.customAlerts = res.meta?.alerts || [];
        this.isLoading = false;
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('手動調整計算エラー:', err);
        this.isLoading = false;
        this.cdr.detectChanges();
      }
    });
  }

  get strategyReason(): string {
    const sc = this.activeScenario;
    if (!sc) return '';

    const depts = sc.departments;
    const id = sc.id;

    const totalSalesYen = sc.totalSales || 0;
    const aProfitYen = depts?.['A']?.profit || 0;
    const bSalesYen = depts?.['B']?.sales || 0;
    const cSalesYen = depts?.['C']?.sales || 0;

    const aAdded = this.getDepartmentBreakdown('A').added;
    const bAdded = this.getDepartmentBreakdown('B').added;
    const cAdded = this.getDepartmentBreakdown('C').added;
    const hasAdded = (aAdded + bAdded + cAdded) > 0;
    const addedText = hasAdded 
      ? `（うち追加採用：A配属 ${aAdded}名 / B配属 ${bAdded}名 / C配属 ${cAdded}名）` 
      : '';

    if (this.isCustomActive) {
      return `手動調整（What-ifシミュレーション）実行中の配置です。各事業部の配属状況や全社数値をご確認ください。`;
    }

    switch (id) {
      case 1:
        return `全社の売上総額（${this.formatNumber(totalSalesYen, 2)}億円）を極大化する最適配置です。` +
               `成長率が高いB・C事業部に能力値の高いメンバーを戦略的に配分しつつ、` +
               `A事業部もペナルティが発生しない最低人数（${depts?.['A']?.count || 0}名）を維持しています。${addedText}`;
      case 2:
        return `主力のA事業部における利益（${this.formatNumber(aProfitYen, 2)}億円）を最優先した配置です。` +
               `A事業部の評価重みが大きい「営業力」「管理力」の優秀層をA事業部に集中的にアサインしています。${addedText}`;
      case 3:
        return `成長事業であるB事業部の売上（${this.formatNumber(bSalesYen, 2)}億円）を最大化する戦略配置です。` +
               `B事業部の主要評価軸である「営業力」「開拓力」に優れた人材を重点配置し、スケールメリットを追求しています。${addedText}`;
      case 4:
        return `将来性の高い新規C事業部の売上（${this.formatNumber(cSalesYen, 2)}億円）を伸ばす集中投資配置です。` +
               `特に「開拓力」の高いメンバーを優先的にC事業部へ配属し、新市場開拓を最速化させます。${addedText}`;
      default:
        return '各事業部の特性と社員能力を考慮した最適配置です。';
    }
  }

  formatNumber(val: number | undefined | null, digits = 2): string {
    if (val === undefined || val === null || isNaN(val)) {
      return '0.00';
    }
    return val.toFixed(digits);
  }

  getFulfillmentRate(department: Department): number {
    const sc = this.activeScenario;
    if (!sc || !sc.departments || !sc.departments[department]) {
      return 0;
    }
    const count = this.isCustomActive 
      ? (this.customAssignments[department]?.length || 0)
      : sc.departments[department].count;
    const appropriate = this.appropriateCounts[department] || 1;
    return (count / appropriate) * 100;
  }

  getFulfillmentWidth(department: Department): number {
    return Math.min(this.getFulfillmentRate(department), 100);
  }

  getAssignedEmployees(department: Department): string[] {
    if (this.isCustomActive) {
      return this.customAssignments[department] || [];
    }
    if (!this.scenario || !this.scenario.assignment || !this.scenario.assignment[department]) {
      return [];
    }
    return this.scenario.assignment[department];
  }

  formatEmployeeId(employeeId: string | number): { label: string; isCandidate: boolean } {
    const idStr = String(employeeId);

    if (idStr.includes('candidate_')) {
      const num = idStr.replace('candidate_', '');
      return { label: `追加${num}`, isCandidate: true };
    }

    const numVal = parseInt(idStr, 10);
    if (!isNaN(numVal) && numVal > 100) {
      return { label: `追加${numVal - 100}`, isCandidate: true };
    }

    if (idStr.toUpperCase().includes('ADD')) {
      const num = idStr.replace(/[^0-9]/g, '');
      return { label: `追加${num}`, isCandidate: true };
    }

    return { label: idStr, isCandidate: false };
  }

  getDepartmentBreakdown(department: Department): { total: number; existing: number; added: number } {
    const assignedList = this.getAssignedEmployees(department);
    let addedCount = 0;
    let existingCount = 0;

    for (const empId of assignedList) {
      const formatted = this.formatEmployeeId(empId);
      if (formatted.isCandidate) {
        addedCount++;
      } else {
        existingCount++;
      }
    }

    return {
      total: assignedList.length,
      existing: existingCount,
      added: addedCount
    };
  }
}