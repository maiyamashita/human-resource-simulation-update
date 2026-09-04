import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

import { Scenario, Department, Employee } from '../../../../models/scenario.model';
import { AdoptionSnapshot } from '../../../adoption-view/adoption-view.component';

export interface DepartmentSkillAverage {
  sales: number;
  management: number;
  development: number;
  training: number;
}

@Component({
  selector: 'app-report-skill-gap',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-skill-gap.html',
  styleUrl: './report-skill-gap.css'
})
export class ReportSkillGapComponent {
  readonly deptKeys: Department[] = ['A', 'B', 'C'];

  @Input() primaryScenario: Scenario | undefined;
  @Input() validScenarios: Scenario[] = [];
  @Input() primaryScenarioId = 1;

  @Input() employees: Employee[] = [];
  @Input() appropriateCounts: Record<Department, number> = { A: 40, B: 35, C: 25 };
  @Input() snapshot: AdoptionSnapshot | null = null;
  @Input() totalEmployeeCount = 100;

  get activeScenario(): Scenario | undefined {
    if (this.primaryScenario) return this.primaryScenario;
    if (this.validScenarios && this.validScenarios.length > 0) {
      return this.validScenarios.find(s => s.id === this.primaryScenarioId) || this.validScenarios[0];
    }
    return undefined;
  }

  /**
   * 部門ごとの配属人数を取得（プロパティ名の表記揺れに対応）
   */
  getDepartmentCount(dept: Department): number {
    const sc = this.activeScenario;
    if (!sc) return 0;

    // 1. departments.X.count / assignedCount
    const deptObj = sc.departments?.[dept] as any;
    if (deptObj) {
      if (typeof deptObj.count === 'number') return deptObj.count;
      if (typeof deptObj.assignedCount === 'number') return deptObj.assignedCount;
    }

    // 2. assignment.X の配列長
    if (sc.assignment && Array.isArray(sc.assignment[dept])) {
      return sc.assignment[dept].length;
    }

    return 0;
  }

  /**
   * 配属社員の4スキル平均を算出（ID参照・プロパティ参照を強力に保護）
   */
  getDepartmentSkillAvg(dept: Department): DepartmentSkillAverage {
    const sc = this.activeScenario;
    if (
      !sc ||
      !sc.assignment ||
      !sc.assignment[dept] ||
      !this.employees ||
      this.employees.length === 0
    ) {
      return { sales: 0, management: 0, development: 0, training: 0 };
    }

    const rawList = sc.assignment[dept] || [];

    // 数値/文字列/オブジェクトの中からIDを純粋抽出
    const assignedIds = new Set<string>(
      rawList.map((item: any) => {
        if (typeof item === 'object' && item !== null) {
          return String(item.id ?? item.employeeId ?? item.employee_id ?? '');
        }
        return String(item);
      }).filter((id: string) => id !== '')
    );

    // 社員一覧から配属メンバーをフィルタリング
    const assignedEmps = this.employees.filter(e => {
      const empId = String(e.id ?? (e as any).employee_id ?? (e as any).employeeId ?? '');
      return assignedIds.has(empId);
    });

    if (assignedEmps.length === 0) {
      return { sales: 0, management: 0, development: 0, training: 0 };
    }

    // 各スキルの合計値を算出
    const sum = assignedEmps.reduce(
      (acc, emp) => {
        const e = emp as any;
        acc.sales += emp.salesAbility ?? e.sales_ability ?? e.sales ?? 0;
        acc.management += emp.managementAbility ?? e.management_ability ?? e.management ?? 0;
        acc.development += emp.developmentAbility ?? e.development_ability ?? e.development ?? 0;
        acc.training += emp.trainingAbility ?? e.training_ability ?? e.training ?? 0;
        return acc;
      },
      { sales: 0, management: 0, development: 0, training: 0 }
    );

    const count = assignedEmps.length;
    return {
      sales: Math.round(sum.sales / count),
      management: Math.round(sum.management / count),
      development: Math.round(sum.development / count),
      training: Math.round(sum.training / count)
    };
  }

  getAllocationWidth(count: number): number {
    const baseCount = this.snapshot ? 100 + this.snapshot.candidateCount : this.totalEmployeeCount;
    if (!count || !baseCount) return 0;
    return Math.min(100, Math.max(0, (count / baseCount) * 100));
  }

  getDepartmentName(dept: Department): string {
    return `${dept}事業部`;
  }
}