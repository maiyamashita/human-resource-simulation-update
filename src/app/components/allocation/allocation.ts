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
  @Input() employees: Employee[] = [];
  @Input() selectedScenarioId = 1;
  @Input() employeeCount = 100;

  @Input() appropriateCounts: Record<Department, number> = {
    A: 40,
    B: 35,
    C: 25
  };

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
}