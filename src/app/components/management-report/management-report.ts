import { Component, EventEmitter, Input, Output, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Scenario, Department, Employee } from '../../models/scenario.model';
import { ReportOverviewComponent } from './components/report-overview/report-overview';
import { ReportForecastComponent } from './components/report-forecast/report-forecast';
import { ReportEmployeeListComponent } from './components/report-employee-list/report-employee-list';
import { ReportCalculationComponent } from './components/report-calculation/report-calculation';
import { ReportAdoptionComponent } from './components/report-adoption/report-adoption';
import { ReportSkillGapComponent } from './components/report-skill-gap/report-skill-gap';
import { AdoptionSnapshot } from '../adoption-view/adoption-view.component';

export type ReportStep = 'composition' | 'preview';
export type PrintStylePreset = 'a4-landscape' | 'a4-portrait' | 'a3-landscape';

interface ReportOptions {
  comparison: boolean;
  forecast: boolean;
  employeeList: boolean;
  calculation: boolean;
  adoption: boolean;
  skillGap: boolean;
}

@Component({
  selector: 'app-management-report',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReportOverviewComponent,
    ReportForecastComponent,
    ReportEmployeeListComponent,
    ReportCalculationComponent,
    ReportAdoptionComponent,
    ReportSkillGapComponent
  ],
  templateUrl: './management-report.html',
  styleUrl: './management-report.css'
})
export class ManagementReportComponent {
  private cdr = inject(ChangeDetectorRef);

  @Input() scenarios: Scenario[] = [];
  @Input() base100Scenarios: Scenario[] = [];
  @Input() employees: Employee[] = [];
  @Input() targetSales = 58.0;
  @Input() appropriateCounts: Record<Department, number> = { A: 40, B: 35, C: 25 };
  @Input() minimumCounts: Record<Department, number> = { A: 30, B: 20, C: 10 };

  @Input() adoptionSnapshots: AdoptionSnapshot[] = [];

  @Output() close = new EventEmitter<void>();

  reportStep: ReportStep = 'composition';

  primaryScenarioId = 1;
  secondaryScenarioId = 4;

  selectedSnapshotId: string | null = null;
  printStylePreset: PrintStylePreset = 'a4-landscape';

  reportOptions: ReportOptions = {
    comparison: true,
    forecast: true,
    employeeList: true,
    calculation: false,
    adoption: false,
    skillGap: false
  };

  get validScenarios(): Scenario[] {
    return (this.scenarios || []).filter(
      (s): s is Scenario => !!s && s.id !== undefined && s.id !== null
    );
  }

  get scenarioCount(): number {
    return this.validScenarios.length;
  }

  get totalEmployeeCount(): number {
    return this.employees && this.employees.length > 0 ? this.employees.length : 100;
  }

  get selectedSnapshot(): AdoptionSnapshot | null {
    if (!this.selectedSnapshotId && this.adoptionSnapshots.length > 0) {
      return this.adoptionSnapshots[0];
    }
    return this.adoptionSnapshots.find(s => s.id === this.selectedSnapshotId) || null;
  }

  get selectedPrimaryScenario(): Scenario | undefined {
    return this.validScenarios.find(s => s.id === this.primaryScenarioId) || this.validScenarios[0];
  }

  get activeSnapshot(): AdoptionSnapshot | null {
    return this.reportOptions.adoption ? this.selectedSnapshot : null;
  }

  get hasSupplementaryMaterial(): boolean {
    return (
      this.reportOptions.employeeList ||
      this.reportOptions.calculation ||
      this.reportOptions.adoption ||
      this.reportOptions.skillGap
    );
  }

  /**
   * STEP 2 (プレビュー表示) へ切り替え
   * DOM構築を検知させてからリサイズイベントを通知し、グラフの初回レンダリング崩れを防止する
   */
  goToPreview(): void {
    if (this.reportOptions.adoption && !this.selectedSnapshotId && this.adoptionSnapshots.length > 0) {
      this.selectedSnapshotId = this.adoptionSnapshots[0].id;
    }
    this.reportStep = 'preview';

    // 1. DOMの構築を確定させる
    this.cdr.detectChanges();

    // 2. 次のマイクロタスクでリサイズイベントを発火し、Canvas/Chart等の要素サイズを正常測定・描画させる
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      this.cdr.detectChanges();
    }, 50);
  }

  goToComposition(): void {
    this.reportStep = 'composition';
    this.cdr.detectChanges();
  }

  toggleOption(option: keyof ReportOptions): void {
    this.reportOptions[option] = !this.reportOptions[option];

    if (option === 'adoption' && this.reportOptions.adoption && this.adoptionSnapshots.length > 0) {
      if (!this.selectedSnapshotId) {
        this.selectedSnapshotId = this.adoptionSnapshots[0].id;
      }
    }
    this.cdr.detectChanges();
  }

  isOptionSelected(option: keyof ReportOptions): boolean {
    return this.reportOptions[option];
  }

  /**
   * 印刷ダイアログの起動
   * 描画中のコンポーネントがある場合に備えて最新化を行った後に印刷命令を実行する
   */
  printReport(): void {
    this.cdr.detectChanges();
    setTimeout(() => {
      window.print();
    }, 100);
  }

  closeReport(): void {
    this.close.emit();
  }
}