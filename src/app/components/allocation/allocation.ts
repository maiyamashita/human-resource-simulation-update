// src/app/components/allocation.ts

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Scenario, Department } from '../../models/scenario.model';
import { Employee } from '../../models/employee.model';

export interface DepartmentSkillAverage {
  sales: number;
  management: number;
  development: number;
  training: number;
}

@Component({
  selector: 'app-allocation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './allocation.html',
  styleUrl: './allocation.css'
})
export class AllocationComponent {

  readonly deptKeys: Department[] = ['A', 'B', 'C'];

  @Input() scenarios: Scenario[] = [];

  // ★ 100名標準時の基準データ（前後比較用）
  @Input() base100Scenarios: Scenario[] = [];

  @Input() employees: Employee[] = [];
  @Input() selectedScenarioId = 1;
  @Input() employeeCount = 100;

  @Input() appropriateCounts: Record<Department, number> = {
    A: 40,
    B: 35,
    C: 25
  };

  // 追加採用適用中かどうか
  get isAdoptionApplied(): boolean {
    return this.employeeCount > 100;
  }

  // 追加採用人数
  get adoptionCount(): number {
    return Math.max(0, this.employeeCount - 100);
  }

  getAllocationWidth(count: number): number {
    if (!count || !this.employeeCount) return 0;
    return (count / this.employeeCount) * 100;
  }

  get selectedScenario(): Scenario | undefined {
    if (!this.scenarios || this.scenarios.length === 0) return undefined;
    return this.scenarios.find(
      scenario => scenario.id === this.selectedScenarioId
    );
  }

  // 100名標準時の同IDシナリオを取得
  getBase100Scenario(id: number): Scenario | undefined {
    return (this.base100Scenarios || []).find(s => s.id === id);
  }

  // ★ 100名標準時との人数差分を取得
  getDeptCountDiff(scenario: Scenario, dept: Department): number {
    if (!this.isAdoptionApplied || !scenario || !scenario.departments?.[dept]) return 0;
    const baseScenario = this.getBase100Scenario(scenario.id);
    if (!baseScenario || !baseScenario.departments?.[dept]) return 0;

    const currentCount = scenario.departments[dept]?.count ?? 0;
    const baseCount = baseScenario.departments[dept]?.count ?? 0;
    return currentCount - baseCount;
  }

  getDepartmentSkillAvg(scenario: Scenario, dept: Department): DepartmentSkillAverage {
    if (!scenario || !scenario.assignment || !scenario.assignment[dept] || !this.employees.length) {
      return { sales: 0, management: 0, development: 0, training: 0 };
    }

    const assignedIds = scenario.assignment[dept];
    const assignedEmps = this.employees.filter(e => assignedIds.includes(e.id || (e as any).employee_id));

    if (assignedEmps.length === 0) {
      return { sales: 0, management: 0, development: 0, training: 0 };
    }

    const sum = assignedEmps.reduce((acc, emp) => {
      const e = emp as any;
      acc.sales += emp.salesAbility ?? e.sales_ability ?? e.sales ?? 0;
      acc.management += emp.managementAbility ?? e.management_ability ?? e.management ?? 0;
      acc.development += emp.developmentAbility ?? e.development_ability ?? e.development ?? 0;
      acc.training += emp.trainingAbility ?? e.training_ability ?? e.training ?? 0;
      return acc;
    }, { sales: 0, management: 0, development: 0, training: 0 });

    const count = assignedEmps.length;
    return {
      sales: Math.round(sum.sales / count),
      management: Math.round(sum.management / count),
      development: Math.round(sum.development / count),
      training: Math.round(sum.training / count)
    };
  }

  // ★ 100名標準時とのスキル平均差分（向上分pt）を取得
  getDeptSkillAvgDiff(scenario: Scenario, dept: Department): DepartmentSkillAverage {
    const currentAvg = this.getDepartmentSkillAvg(scenario, dept);
    if (!this.isAdoptionApplied) {
      return { sales: 0, management: 0, development: 0, training: 0 };
    }

    const baseScenario = this.getBase100Scenario(scenario.id);
    if (!baseScenario) {
      return { sales: 0, management: 0, development: 0, training: 0 };
    }

    const baseAvg = this.getDepartmentSkillAvg(baseScenario, dept);
    return {
      sales: currentAvg.sales - baseAvg.sales,
      management: currentAvg.management - baseAvg.management,
      development: currentAvg.development - baseAvg.development,
      training: currentAvg.training - baseAvg.training
    };
  }
}