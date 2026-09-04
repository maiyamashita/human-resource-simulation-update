// src/app/components/management-report/components/report-employee-list/report-employee-list.ts

import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Scenario, Department, Employee } from '../../../../models/scenario.model';

@Component({
  selector: 'app-report-employee-list',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-employee-list.html',
  styleUrl: './report-employee-list.css'
})
export class ReportEmployeeListComponent {
  @Input() validScenarios: Scenario[] = [];
  @Input() employees: Employee[] = [];
  @Input() primaryScenarioId = 1; // メイン提案シナリオID（第一候補固定）

  // ★ HTML側でループ回すための型定義済み配列
  readonly depts: Department[] = ['A', 'B', 'C'];

  // ★ HTMLテンプレート側で Math.max を使用するために定義
  readonly Math = Math;

  getScenarioName(sc: Scenario | null): string {
    if (!sc) return '';
    if (sc.id === 1) return 'S1：全社売上最大';
    if (sc.id === 2) return 'S2：A利益最大';
    if (sc.id === 3) return 'S3：B売上最大';
    if (sc.id === 4) return 'S4：C売上最大';
    return sc.shortName || sc.name || `S${sc.id}`;
  }

  // プレビュー画面では第一候補（推奨案）のシナリオのみを固定取得
  get selectedEmployeeScenario(): Scenario | null {
    return this.validScenarios.find(s => s.id === this.primaryScenarioId) || this.validScenarios[0] || null;
  }

  getAssignedEmployees(scenario: Scenario | null, dept: Department): Employee[] {
    if (!scenario?.assignment?.[dept] || !this.employees) return [];
    const assignedIds = scenario.assignment[dept].map(String);
    return this.employees.filter(emp => assignedIds.includes(String(emp.id)));
  }
}