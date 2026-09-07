// src/app/app.ts

import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScenarioDataService, RecalculateResponse } from './services/scenario-data.service';
import { EmployeeDataService } from './services/employee-data.service';

import {
  TARGET_SALES,
  EMPLOYEE_COUNT,
  APPROPRIATE_COUNTS,
  MINIMUM_COUNTS
} from './constants/simulation.constants';

import { Scenario, Department } from './models/scenario.model';
import { Employee } from './models/employee.model';

import { HeaderComponent, SnapshotItem } from './components/header/header';
import { ScenarioComparisonComponent } from './components/scenario-comparison/scenario-comparison';
import { ChartsComponent } from './components/charts/charts';
import { AllocationComponent } from './components/allocation/allocation';
import { ScenarioDetailComponent } from './components/scenario-detail/scenario-detail';

import {
  AdoptionMode,
  AdoptionOptimizationMode,
  CandidateEmployee
} from './components/adoption-control/adoption-control.component';

import { ManagementReportComponent } from './components/management-report/management-report';
import { AdoptionViewComponent, AdoptionSnapshot } from './components/adoption-view/adoption-view.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    HeaderComponent,
    ScenarioComparisonComponent,
    ChartsComponent,
    AllocationComponent,
    ScenarioDetailComponent,
    ManagementReportComponent,
    AdoptionViewComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {

  private cdr = inject(ChangeDetectorRef);

  get isLoaded(): boolean {
    return this.employees.length > 0 && this.scenarios.length > 0;
  }

  activeTab: 'dashboard' | 'forecast' | 'detail' | 'adoption' = 'dashboard';

  switchTab(
    tab: 'dashboard' | 'forecast' | 'detail' | 'adoption'
  ): void {
    this.activeTab = tab;
    this.cdr.detectChanges();
  }

  reportMode = false;

  openManagementReport(): void {
    this.reportMode = true;
    this.cdr.detectChanges();
  }

  closeManagementReport(): void {
    this.reportMode = false;
    this.cdr.detectChanges();
  }

  targetSales = TARGET_SALES;
  employeeCount = EMPLOYEE_COUNT;

  appropriateCounts: Record<Department, number> = {
    ...APPROPRIATE_COUNTS
  };

  minimumCounts: Record<Department, number> = {
    ...MINIMUM_COUNTS
  };

  adoptionMode: AdoptionMode = 'standard';

  /**
   * 追加採用時の最適化方式
   *
   * all   : 既存100名 + 追加採用者をまとめて再配置
   * fixed : 既存100名の配置を固定し、追加採用者のみ配置
   */
  adoptionOptimizationMode: AdoptionOptimizationMode = 'all';

  candidateEmployees: CandidateEmployee[] = [];

  adoptionSnapshots: AdoptionSnapshot[] = [];
  selectedSnapshotId = '';

  // ★ タブ間移動でWhat-if手動調整（S99）の状態を自動キープするための親側プロパティ
  isCustomActive = false;
  customAssignments: Record<Department, string[]> = { A: [], B: [], C: [] };
  customScenarioResult: Scenario | null = null;
  customAlerts: RecalculateResponse['meta']['alerts'] = [];
  movedEmployeeIds: Set<string> = new Set<string>();

  get headerSnapshots(): SnapshotItem[] {
    return (this.adoptionSnapshots || []).map(sn => {
      let timeStr = '';

      if (sn.createdAt) {
        const d = new Date(sn.createdAt);

        timeStr = isNaN(d.getTime())
          ? ''
          : d.toLocaleDateString(
              'ja-JP',
              {
                month: 'numeric',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              }
            );
      }

      return {
        id: sn.id || '',
        name: sn.name || '無題のセーブデータ',
        timestamp: timeStr
      };
    });
  }

  onSnapshotsChange(snapshots: AdoptionSnapshot[]): void {
    this.adoptionSnapshots = snapshots;
    this.cdr.detectChanges();
  }

  onSaveSnapshotFromHeader(name: string): void {
    const selectedSc = this.selectedScenario;
    const baseSc = this.selectedBase100Scenario;

    const salesDiff =
      (selectedSc && baseSc)
        ? Number(
            (
              (selectedSc.totalSales || 0) -
              (baseSc.totalSales || 0)
            ).toFixed(2)
          )
        : 0;

    const profitDiff =
      (selectedSc && baseSc)
        ? Number(
            (
              (selectedSc.totalProfit || 0) -
              (baseSc.totalProfit || 0)
            ).toFixed(2)
          )
        : 0;

    const newSnapshot: AdoptionSnapshot = {
      id: 'sn_' + Date.now(),
      name,
      createdAt: new Date(),
      candidates: JSON.parse(
        JSON.stringify(this.candidateEmployees)
      ),
      candidateCount: this.candidateEmployees.length,
      salesDiff,
      profitDiff,
      scenarioId: this.selectedScenarioId
    };

    const snAny = newSnapshot as any;

    snAny.scenarios =
      JSON.parse(JSON.stringify(this.scenarios));

    snAny.targetSales = this.targetSales;
    snAny.selectedScenarioId = this.selectedScenarioId;
    snAny.adoptionMode = this.adoptionMode;

    // ★ 追加採用時の最適化方式も保存
    snAny.adoptionOptimizationMode =
      this.adoptionOptimizationMode;

    this.adoptionSnapshots = [
      newSnapshot,
      ...this.adoptionSnapshots
    ];

    this.selectedSnapshotId = newSnapshot.id;

    this.cdr.detectChanges();
  }

  onLoadSnapshotFromHeader(snapshotId: string): void {
    const target =
      this.adoptionSnapshots.find(
        s => s.id === snapshotId
      );

    if (!target) {
      return;
    }

    const targetAny = target as any;

    this.selectedSnapshotId = target.id;

    if (targetAny.targetSales) {
      this.targetSales = targetAny.targetSales;
    }

    if (targetAny.selectedScenarioId) {
      this.selectedScenarioId =
        targetAny.selectedScenarioId;
    }

    if (targetAny.adoptionMode) {
      this.adoptionMode =
        targetAny.adoptionMode;
    }

    // ★ 保存されている場合のみ復元
    // 古いスナップショットにはこの値がないため、
    // その場合は現在の初期値 'all' を維持する。
    if (
      targetAny.adoptionOptimizationMode === 'all' ||
      targetAny.adoptionOptimizationMode === 'fixed'
    ) {
      this.adoptionOptimizationMode =
        targetAny.adoptionOptimizationMode;
    }

    if (target.candidates) {
      this.candidateEmployees =
        JSON.parse(
          JSON.stringify(target.candidates)
        );
    }

    if (this.adoptionMode === 'adoption') {
      this.reRunSimulation();
    } else {
      this.cdr.detectChanges();
    }
  }

  scenarios: Scenario[] = [];
  base100Scenarios: Scenario[] = [];
  selectedScenarioId = 1;
  employees: Employee[] = [];
  currentFile: File | null = null;

  csvError = '';
  scenarioError = '';
  loading = false;

  constructor(
    private employeeDataService: EmployeeDataService,
    private scenarioDataService: ScenarioDataService
  ) {}

  get selectedScenario(): Scenario | null {
    if (
      !this.scenarios ||
      this.scenarios.length === 0
    ) {
      return null;
    }

    // ★ 手動調整実行中の場合はS99の試算結果を最優先で返す（追従バーにも即時反映）
    if (
      this.isCustomActive &&
      this.customScenarioResult
    ) {
      return this.customScenarioResult;
    }

    return (
      this.scenarios.find(
        scenario =>
          scenario &&
          scenario.id === this.selectedScenarioId
      ) ??
      this.scenarios[0] ??
      null
    );
  }

  get selectedBase100Scenario(): Scenario | null {
    if (
      !this.base100Scenarios ||
      this.base100Scenarios.length === 0
    ) {
      return null;
    }

    return (
      this.base100Scenarios.find(
        scenario =>
          scenario &&
          scenario.id === this.selectedScenarioId
      ) ?? null
    );
  }

  selectScenario(id: number): void {
    this.selectedScenarioId = id;
    this.resetCustomState();
    this.cdr.detectChanges();
  }

  resetCustomState(): void {
    this.isCustomActive = false;
    this.customScenarioResult = null;
    this.customAlerts = [];
    this.customAssignments = {
      A: [],
      B: [],
      C: []
    };
    this.movedEmployeeIds.clear();
  }

  onTargetSalesChange(newTargetSales: number): void {
    if (
      !newTargetSales ||
      newTargetSales <= 0
    ) {
      return;
    }

    this.targetSales = newTargetSales;
    this.cdr.detectChanges();
  }

  onModeChange(mode: AdoptionMode): void {
    this.adoptionMode = mode;
    this.resetCustomState();

    if (mode === 'standard') {
      this.resetToStandardCounts();

      if (
        this.base100Scenarios &&
        this.base100Scenarios.length > 0
      ) {
        this.scenarios =
          JSON.parse(
            JSON.stringify(
              this.base100Scenarios
            )
          );

        this.cdr.detectChanges();
      } else {
        this.reRunSimulation();
      }
    }
  }

  /**
   * 追加採用時の最適化方式変更
   *
   * 方式を変更した時点では結果を直接変更せず、
   * 現在の候補者条件を使って再シミュレーションする。
   */
  onOptimizationModeChange(
  mode: AdoptionOptimizationMode
): void {
  this.adoptionOptimizationMode = mode;
  this.resetCustomState();
  this.cdr.detectChanges();
}

  resetAdoptionToStandard(): void {
    this.onModeChange('standard');
  }

  onCandidatesChange(
    candidates: CandidateEmployee[]
  ): void {
    this.candidateEmployees = candidates;

    if (
      this.adoptionMode === 'adoption'
    ) {
      this.reRunSimulation();
    }
  }

  private applyDynamicCountsFromScenario(
    scenario: Scenario | undefined
  ): void {
    if (
      scenario?.appropriateCounts &&
      scenario?.minimumCounts
    ) {
      this.appropriateCounts = {
        ...scenario.appropriateCounts
      };

      this.minimumCounts = {
        ...scenario.minimumCounts
      };
    }
  }

  private resetToStandardCounts(): void {
    this.appropriateCounts = {
      ...APPROPRIATE_COUNTS
    };

    this.minimumCounts = {
      ...MINIMUM_COUNTS
    };
  }

  onCsvSelected(event: Event): void {
    const input =
      event.target as HTMLInputElement;

    const file = input.files?.[0];

    if (!file) {
      return;
    }

    this.currentFile = file;
    this.csvError = '';
    this.scenarioError = '';

    this.scenarios = [];
    this.base100Scenarios = [];
    this.employees = [];
    this.selectedScenarioId = 1;

    // ★ 新しいCSVを読み込んだ場合は
    // 追加採用の最適化方式を既定の「一括最適化」に戻す
    this.adoptionOptimizationMode = 'all';

    this.resetCustomState();

    this.employeeDataService
      .readCsv(file)
      .then(employees => {
        this.employees = employees;
        this.loadScenarios(file);
      })
      .catch(error => {
        console.error(
          'CSV解析エラー:',
          error
        );

        this.loadScenarios(file);
      });
  }

  private reRunSimulation(): void {
    if (this.currentFile) {
      this.loadScenarios(
        this.currentFile
      );
    }
  }

  private loadScenarios(
    file: File | null
  ): void {
    if (!file) {
      return;
    }

    this.loading = true;
    this.scenarioError = '';
    this.cdr.detectChanges();

    const isAdoption =
      this.adoptionMode === 'adoption';

    const request$ = isAdoption
      ? this.scenarioDataService.postAdoptionScenarios(
          file,
          this.candidateEmployees,
          this.adoptionOptimizationMode
        )
      : this.scenarioDataService.postCsvAndGetScenarios(
          file
        );

    request$.subscribe({
      next: (scenarios: Scenario[]) => {
        const validScenarios =
          (scenarios || [])
            .filter(
              (s): s is Scenario =>
                !!s &&
                s.id !== undefined &&
                s.id !== null
            );

        if (isAdoption && validScenarios) {
          validScenarios.forEach(s => {
            (s as any).isAdoptionResult = true;
          });
        }

        this.scenarios =
          validScenarios;

        if (
          !isAdoption &&
          validScenarios.length > 0
        ) {
          this.base100Scenarios =
            JSON.parse(
              JSON.stringify(
                validScenarios
              )
            );
        }

        if (
          validScenarios.length > 0
        ) {
          this.selectedScenarioId =
            validScenarios[0].id;

          this.applyDynamicCountsFromScenario(
            validScenarios[0]
          );
        }

        this.loading = false;
        this.cdr.detectChanges();
      },

      error: (error: any) => {
        console.error(
          '最適化通信エラー:',
          error
        );

        this.scenarios = [];

        this.scenarioError =
          '最適化結果を取得できませんでした。';

        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }
}
