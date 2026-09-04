import { 
  Component, 
  Input, 
  Output,
  EventEmitter,
  OnChanges, 
  SimpleChanges, 
  ChangeDetectorRef,
  HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Scenario, Department, Employee } from '../../models/scenario.model';
import { 
  ScenarioDataService, 
  ManualEmployeeInput, 
  RecalculateResponse 
} from '../../services/scenario-data.service';
import { EmployeeNoticeComponent } from '../employee-notice/employee-notice.component';
import { CandidateEmployee } from '../adoption-control/adoption-control.component';

@Component({
  selector: 'app-scenario-detail',
  standalone: true,
  imports: [
    CommonModule,
    EmployeeNoticeComponent
  ],
  templateUrl: './scenario-detail.html',
  styleUrl: './scenario-detail.css'
})
export class ScenarioDetailComponent implements OnChanges {

  readonly deptKeys: Department[] = ['A', 'B', 'C'];

  @Input() scenario: Scenario | null = null;
  @Input() base100Scenario: Scenario | null = null;
  @Input() employees: Employee[] = [];
  @Input() candidateEmployees: CandidateEmployee[] = [];
  @Input() targetSales = 58.0;
  @Input() totalEmployeeCount = 100;

  @Input() appropriateCounts: Record<Department, number> = { A: 40, B: 35, C: 25 };
  @Input() minimumCounts: Record<Department, number> = { A: 30, B: 20, C: 10 };

  private defaultAppropriateCounts: Record<Department, number> = { A: 40, B: 35, C: 25 };
  private defaultMinimumCounts: Record<Department, number> = { A: 30, B: 20, C: 10 };

  // 氏名マスキング状態（初期値：OFF＝氏名表示）
  isMasked = false;

  toggleMasking(): void {
    this.isMasked = !this.isMasked;
  }

  get isAdoptionApplied(): boolean {
    return this.totalEmployeeCount > 100;
  }

  get adoptionCount(): number {
    return Math.max(0, this.totalEmployeeCount - 100);
  }

  get base100SalesDiff(): number {
    if (!this.isAdoptionApplied || !this.scenario?.totalSales || !this.base100Scenario?.totalSales) return 0;
    return this.scenario.totalSales - this.base100Scenario.totalSales;
  }

  get base100ProfitDiff(): number {
    if (!this.isAdoptionApplied || !this.scenario?.totalProfit || !this.base100Scenario?.totalProfit) return 0;
    return this.scenario.totalProfit - this.base100Scenario.totalProfit;
  }

  // ★ タブ移動後も手動調整（What-if）状態を自動キープするための双方向バインディングプロパティ
  @Input() isCustomActive = false;
  @Output() isCustomActiveChange = new EventEmitter<boolean>();

  @Input() customAssignments: Record<Department, string[]> = { A: [], B: [], C: [] };
  @Output() customAssignmentsChange = new EventEmitter<Record<Department, string[]>>();

  @Input() customScenarioResult: Scenario | null = null;
  @Output() customScenarioResultChange = new EventEmitter<Scenario | null>();

  @Input() customAlerts: RecalculateResponse['meta']['alerts'] = [];
  @Output() customAlertsChange = new EventEmitter<RecalculateResponse['meta']['alerts']>();

  @Input() movedEmployeeIds: Set<string> = new Set<string>();
  @Output() movedEmployeeIdsChange = new EventEmitter<Set<string>>();

  isLoading = false;

  selectedEmployeeId: string | null = null;
  selectedFromDept: Department | null = null;

  // 配属通知書モーダル用プロパティ
  isNoticeModalOpen = false;
  selectedNoticeEmployee: Employee | null = null;
  selectedNoticeDept: Department = 'A';

  constructor(
    private scenarioDataService: ScenarioDataService,
    private cdr: ChangeDetectorRef
  ) {}

  @HostListener('document:keydown.escape', ['$event'])
  handleKeyboardEvent(event: Event): void {
    if (this.isNoticeModalOpen) {
      this.closeNoticeModal();
    }
  }

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

  get totalSalesDiff(): number {
    if (!this.isCustomActive || !this.scenario?.totalSales || !this.customScenarioResult?.totalSales) return 0;
    return this.customScenarioResult.totalSales - this.scenario.totalSales;
  }

  get totalProfitDiff(): number {
    if (!this.isCustomActive || !this.scenario?.totalProfit || !this.customScenarioResult?.totalProfit) return 0;
    return this.customScenarioResult.totalProfit - this.scenario.totalProfit;
  }

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
      this.customAssignmentsChange.emit(this.customAssignments);

      this.movedEmployeeIds.clear();
      this.movedEmployeeIdsChange.emit(this.movedEmployeeIds);
    }

    const empId = this.selectedEmployeeId;
    const fromDept = this.selectedFromDept;

    this.customAssignments[fromDept] = this.customAssignments[fromDept].filter(id => id !== empId);
    this.customAssignments[targetDept].push(empId);
    this.customAssignments[targetDept] = this.sortEmployeeIds(this.customAssignments[targetDept]);
    this.customAssignmentsChange.emit(this.customAssignments);

    const originalDept = this.getOriginalDeptOfEmployee(empId);
    if (originalDept !== targetDept) {
      this.movedEmployeeIds.add(empId);
    } else {
      this.movedEmployeeIds.delete(empId);
    }
    this.movedEmployeeIdsChange.emit(this.movedEmployeeIds);

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
    this.isCustomActiveChange.emit(false);

    this.customScenarioResult = null;
    this.customScenarioResultChange.emit(null);

    this.customAlerts = [];
    this.customAlertsChange.emit([]);

    this.customAssignments = { A: [], B: [], C: [] };
    this.customAssignmentsChange.emit(this.customAssignments);

    this.movedEmployeeIds.clear();
    this.movedEmployeeIdsChange.emit(this.movedEmployeeIds);

    this.clearSelection();
    this.cdr.detectChanges();
  }

  private recalculateCustomAssignment(): void {
    this.isLoading = true;
    const payload: ManualEmployeeInput[] = [];

    this.deptKeys.forEach(dept => {
      const empIds = this.customAssignments[dept];
      empIds.forEach(id => {
        const idStr = String(id);
        
        let emp = this.employees.find(e => {
          const eAny = e as any;
          const targetId = String(e.id || eAny.employee_id || eAny.employeeId || '');
          return targetId === idStr;
        });

        let cand = this.candidateEmployees.find(c => String(c.id) === idStr || idStr.includes(String(c.id)));

        const e = (emp || {}) as any;
        const c = cand || {} as any;
        
        const sVal = Number(e.salesAbility ?? e.sales_ability ?? c.sales_ability ?? 60) || 60;
        const mVal = Number(e.managementAbility ?? e.management_ability ?? c.management_ability ?? 60) || 60;
        const dVal = Number(e.developmentAbility ?? e.development_ability ?? c.development_ability ?? 60) || 60;
        const tVal = Number(e.trainingAbility ?? e.training_ability ?? c.training_ability ?? 60) || 60;
        const cVal = Number(e.personnelCost ?? e.personnel_cost ?? c.cost ?? 10) || 10;
        const pDept = String(e.desiredDepartment ?? e.preferred_dept ?? '');

        payload.push({
          employee_id: idStr,
          sales: sVal,
          management: mVal,
          development: dVal,
          training: tVal,
          personnel_cost: cVal,
          assigned_dept: String(dept),
          preferred_dept: pDept
        });
      });
    });

    this.scenarioDataService.recalculateManualAssignment(payload, this.targetSales).subscribe({
      next: (res) => {
        this.isCustomActive = true;
        this.isCustomActiveChange.emit(true);

        this.customScenarioResult = res.scenario;
        this.customScenarioResultChange.emit(res.scenario);

        this.customAlerts = res.meta?.alerts || [];
        this.customAlertsChange.emit(this.customAlerts);

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

    const avgA = this.getDepartmentSkillAverages('A');
    const avgB = this.getDepartmentSkillAverages('B');
    const avgC = this.getDepartmentSkillAverages('C');

    switch (id) {
      case 1:
        return `全社売上を極大化（${this.formatNumber(totalSalesYen, 2)}億円）する最重点配置です。` +
               `成長率が最も高いC事業部（成長率25%）に開拓力優秀層（平均${avgC.dev}pt）を、` +
               `B事業部（成長率12%）に営業力優秀層（平均${avgB.sales}pt）を重点投入。` +
               `A事業部はペナルティ回避に必要な最低人数（${depts?.['A']?.count || 0}名）を維持し、全社的な売上創出レバレッジを最大化させています。${addedText}`;

      case 2:
        return `主力のA事業部における利益（${this.formatNumber(aProfitYen, 2)}億円）を最優先で死守する配置です。` +
               `A事業部で高い評価重みを持つ「営業力(0.45)」「管理力(0.35)」に長けた層（管理力平均${avgA.mgmt}pt）をA事業部に集中投入。` +
               `過不足ペナルティを完璧に抑え、確実で高品質な利益の創出を図っています。${addedText}`;

      case 3:
        return `成長事業であるB事業部の売上（${this.formatNumber(bSalesYen, 2)}億円）を限界突破させる攻めの配置です。` +
               `B事業部の主要評価軸である「営業力(0.35)」と「開拓力(0.30)」の双方に優れた即戦力人材（営業力平均${avgB.sales}pt）を優先配置し、` +
               `拡大期の市場シェア拡大とスケールメリットを強力に追求しています。${addedText}`;

      case 4:
        return `将来性の高い新規C事業部の売上（${this.formatNumber(cSalesYen, 2)}億円）を最速で立ち上げる集中投資配置です。` +
               `最も配分重みの高い「開拓力(0.50)」に特化したエース人材（開拓力平均${avgC.dev}pt）をC事業部へ集中的に配属し、` +
               `新規市場における開拓スピードと成功率を最大化させています。${addedText}`;

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

    const emp = this.employees?.find(e => {
      const eAny = e as any;
      const targetId = String(e.id || eAny.employee_id || eAny.employeeId || '');
      return targetId === idStr;
    });

    let isCandidate = false;
    let fallbackLabel = idStr;

    if (idStr.startsWith('A') || idStr.includes('candidate_') || idStr.toUpperCase().includes('ADD')) {
      const num = idStr.replace(/[^0-9]/g, '');
      const formattedNum = num ? parseInt(num, 10) : '';
      fallbackLabel = `採用候補者 ${formattedNum}`;
      isCandidate = true;
    } else {
      const numVal = parseInt(idStr, 10);
      if (!isNaN(numVal) && numVal > 100) {
        fallbackLabel = `採用候補者 ${numVal - 100}`;
        isCandidate = true;
      }
    }

    if (isCandidate && this.candidateEmployees && this.candidateEmployees.length > 0) {
      const matchedCand = this.candidateEmployees.find(c => {
        const cId = String(c.id);
        return cId === idStr || idStr.endsWith(cId) || cId.endsWith(idStr);
      });
      if (matchedCand && matchedCand.name && matchedCand.name.trim() !== '') {
        fallbackLabel = matchedCand.name;
      }
    }

    if (this.isMasked) {
      const cleanId = idStr.replace(/^#/, '');
      const maskedLabel = `#${cleanId}`;
      return { label: maskedLabel, isCandidate };
    }

    const displayName = emp?.name ? emp.name : fallbackLabel;
    return { label: displayName, isCandidate };
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

  getDepartmentSkillAverages(department: Department): { sales: number; mgmt: number; dev: number; train: number } {
    const assignedIds = this.getAssignedEmployees(department);
    if (!assignedIds || assignedIds.length === 0 || !this.employees || this.employees.length === 0) {
      return { sales: 0, mgmt: 0, dev: 0, train: 0 };
    }

    const empMap = new Map<string, Employee>(
      this.employees.map(e => [String(e.id), e])
    );

    let sumSales = 0, sumMgmt = 0, sumDev = 0, sumTrain = 0;
    let count = 0;

    for (const id of assignedIds) {
      const idStr = String(id);
      let emp = empMap.get(idStr);

      if (emp) {
        sumSales += emp.salesAbility || 0;
        sumMgmt += emp.managementAbility || 0;
        sumDev += emp.developmentAbility || 0;
        sumTrain += emp.trainingAbility || 0;
        count++;
      } else {
        const cand = this.candidateEmployees.find(c => String(c.id) === idStr || idStr.includes(String(c.id)));
        if (cand) {
          sumSales += cand.sales_ability || 0;
          sumMgmt += cand.management_ability || 0;
          sumDev += cand.development_ability || 0;
          sumTrain += cand.training_ability || 0;
          count++;
        }
      }
    }

    if (count === 0) return { sales: 0, mgmt: 0, dev: 0, train: 0 };

    return {
      sales: Math.round((sumSales / count) * 10) / 10,
      mgmt: Math.round((sumMgmt / count) * 10) / 10,
      dev: Math.round((sumDev / count) * 10) / 10,
      train: Math.round((sumTrain / count) * 10) / 10
    };
  }

  getDepartmentFocusLabel(department: Department): string {
    const avg = this.getDepartmentSkillAverages(department);
    if (department === 'A') {
      return `管理力 ${avg.mgmt}pt / 営業力 ${avg.sales}pt（安定稼働・利益保護）`;
    } else if (department === 'B') {
      return `営業力 ${avg.sales}pt / 育成力 ${avg.train}pt（事業拡大・成長加速）`;
    } else {
      return `開拓力 ${avg.dev}pt 特化（新市場開拓・将来投資）`;
    }
  }

  openEmployeeNotice(empId: string | number, dept: Department, event?: MouseEvent): void {
    if (event) {
      event.stopPropagation();
    }

    const empIdStr = String(empId);
    let targetEmp = this.employees.find(e => {
      const eAny = e as any;
      const targetId = String(e.id || eAny.employee_id || eAny.employeeId || '');
      return targetId === empIdStr;
    });

    if (!targetEmp) {
      const cand = this.candidateEmployees.find(c => String(c.id) === empIdStr || empIdStr.includes(String(c.id)));
      if (cand) {
        targetEmp = {
          id: cand.id as any,
          name: cand.name || `採用候補者 #${cand.id}`,
          salesAbility: cand.sales_ability,
          managementAbility: cand.management_ability,
          developmentAbility: cand.development_ability,
          trainingAbility: cand.training_ability,
          personnelCost: cand.cost,
          currentDepartment: dept
        } as Employee;
      }
    }

    if (targetEmp) {
      this.selectedNoticeEmployee = targetEmp;
      this.selectedNoticeDept = dept;
      this.isNoticeModalOpen = true;
      this.cdr.detectChanges();
    }
  }

  closeNoticeModal(): void {
    this.isNoticeModalOpen = false;
    this.selectedNoticeEmployee = null;
    this.cdr.detectChanges();
  }

  navigateNoticeEmployee(direction: 'prev' | 'next'): void {
    if (!this.selectedNoticeEmployee) return;

    const assignedIds = this.getAssignedEmployees(this.selectedNoticeDept);
    const currentIdStr = String(this.selectedNoticeEmployee.id);
    const currentIndex = assignedIds.findIndex(id => String(id) === currentIdStr);

    if (currentIndex === -1) return;

    let targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

    if (targetIndex >= assignedIds.length) {
      targetIndex = 0;
    } else if (targetIndex < 0) {
      targetIndex = assignedIds.length - 1;
    }

    const nextEmpIdStr = String(assignedIds[targetIndex]);
    let nextEmp = this.employees.find(e => {
      const eAny = e as any;
      const targetId = String(e.id || eAny.employee_id || eAny.employeeId || '');
      return targetId === nextEmpIdStr;
    });

    if (!nextEmp) {
      const cand = this.candidateEmployees.find(c => String(c.id) === nextEmpIdStr || nextEmpIdStr.includes(String(c.id)));
      if (cand) {
        nextEmp = {
          id: cand.id as any,
          name: cand.name || `採用候補者 #${cand.id}`,
          salesAbility: cand.sales_ability,
          managementAbility: cand.management_ability,
          developmentAbility: cand.development_ability,
          trainingAbility: cand.training_ability,
          personnelCost: cand.cost,
          currentDepartment: this.selectedNoticeDept
        } as Employee;
      }
    }

    if (nextEmp) {
      this.selectedNoticeEmployee = nextEmp;
      this.cdr.detectChanges();
    }
  }
}