import { Component, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScenarioDataService } from './services/scenario-data.service';
import { EmployeeDataService } from './services/employee-data.service';

import {
  TARGET_SALES,
  EMPLOYEE_COUNT,
  APPROPRIATE_COUNTS,
  MINIMUM_COUNTS
} from './constants/simulation.constants';

import { Scenario, Department } from './models/scenario.model';
import { Employee } from './models/employee.model';

import { HeaderComponent } from './components/header/header';
import { ScenarioComparisonComponent } from './components/scenario-comparison/scenario-comparison';
import { ChartsComponent } from './components/charts/charts';
import { AllocationComponent } from './components/allocation/allocation';
import { ScenarioDetailComponent } from './components/scenario-detail/scenario-detail';
import { 
  AdoptionControlComponent, 
  AdoptionMode, 
  CandidateEmployee 
} from './components/adoption-control/adoption-control.component';
import { AdoptionDiffComponent } from './components/adoption-diff/adoption-diff.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule, 
    HeaderComponent,
    AdoptionControlComponent,
    ScenarioComparisonComponent,
    ChartsComponent,
    AllocationComponent,
    ScenarioDetailComponent,
    AdoptionDiffComponent
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

  switchTab(tab: 'dashboard' | 'forecast' | 'detail' | 'adoption'): void {
    this.activeTab = tab;
    this.cdr.detectChanges();
  }

  // --------------------------------------------------
  // 基本設定（目標入力値）
  // --------------------------------------------------
  targetSales = TARGET_SALES;
  employeeCount = EMPLOYEE_COUNT;
  
  appropriateCounts: Record<Department, number> = { ...APPROPRIATE_COUNTS };
  minimumCounts: Record<Department, number> = { ...MINIMUM_COUNTS };

  // --------------------------------------------------
  // 追加採用モード状態管理
  // --------------------------------------------------
  adoptionMode: AdoptionMode = 'standard';
  candidateEmployees: CandidateEmployee[] = [];

  // --------------------------------------------------
  // シナリオ・データ保持
  // --------------------------------------------------
  scenarios: Scenario[] = [];
  
  // ★ 100名体制時の絶対最適結果をメモリ保持（キャッシュ）する変数
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
    if (!this.scenarios || this.scenarios.length === 0) {
      return null;
    }
    return this.scenarios.find(
      scenario => scenario && scenario.id === this.selectedScenarioId
    ) ?? this.scenarios[0] ?? null;
  }

  selectScenario(id: number): void {
    this.selectedScenarioId = id;
    this.cdr.detectChanges();
  }

  onTargetSalesChange(newTargetSales: number): void {
    if (!newTargetSales || newTargetSales <= 0) return;
    this.targetSales = newTargetSales;
    this.cdr.detectChanges();
  }

  // --------------------------------------------------
  // モード切替（追加採用 ↔ 通常100名）
  // --------------------------------------------------
  onModeChange(mode: AdoptionMode): void {
    this.adoptionMode = mode;
    
    if (mode === 'standard') {
      this.resetToStandardCounts();

      // ★ 100名に戻す場合はPythonへの通信を行わず、保持していた初期結果を0秒で復元
      if (this.base100Scenarios && this.base100Scenarios.length > 0) {
        this.scenarios = JSON.parse(JSON.stringify(this.base100Scenarios));
        this.cdr.detectChanges();
      } else {
        this.reRunSimulation();
      }
    }
  }

  onCandidatesChange(candidates: CandidateEmployee[]): void {
    this.candidateEmployees = candidates;
    if (this.adoptionMode === 'adoption') {
      this.updateDynamicCounts(candidates.length);
      this.reRunSimulation();
    }
  }

  private updateDynamicCounts(addedCount: number): void {
    const total = 100 + addedCount;

    const rawA = total * 0.40;
    const rawB = total * 0.35;
    const rawC = total * 0.25;

    const appA = Math.floor(rawA);
    const appB = Math.floor(rawB);
    const appC = Math.floor(rawC);

    const remainder = total - (appA + appB + appC);
    const remA = rawA - appA;
    const remB = rawB - appB;
    const remC = rawC - appC;

    let appCounts = { A: appA, B: appB, C: appC };
    const depts: Department[] = ['A', 'B', 'C'];
    depts.sort((d1, d2) => {
      const r1 = d1 === 'A' ? remA : d1 === 'B' ? remB : remC;
      const r2 = d2 === 'A' ? remA : d2 === 'B' ? remB : remC;
      return r2 - r1;
    });

    for (let i = 0; i < remainder; i++) {
      appCounts[depts[i]] += 1;
    }

    this.appropriateCounts = appCounts;

    this.minimumCounts = {
      A: Math.max(1, Math.floor(appCounts.A * (30.0 / 40.0))),
      B: Math.max(1, Math.floor(appCounts.B * (20.0 / 35.0))),
      C: Math.max(1, Math.floor(appCounts.C * (10.0 / 25.0)))
    };
  }

  private resetToStandardCounts(): void {
    this.appropriateCounts = { ...APPROPRIATE_COUNTS };
    this.minimumCounts = { ...MINIMUM_COUNTS };
  }

  // --------------------------------------------------
  // CSV読み込み・通信処理
  // --------------------------------------------------
  onCsvSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    this.currentFile = file;
    this.csvError = '';
    this.scenarioError = '';
    this.scenarios = [];
    this.base100Scenarios = [];
    this.employees = [];
    this.selectedScenarioId = 1;

    this.employeeDataService
      .readCsv(file)
      .then(employees => {
        this.employees = employees;
        this.loadScenarios(file);
      })
      .catch(error => {
        console.error('CSV解析エラー:', error);
        this.loadScenarios(file);
      });
  }

  private reRunSimulation(): void {
    if (this.currentFile) {
      this.loadScenarios(this.currentFile);
    }
  }

  private loadScenarios(file: File | null): void {
    if (!file) return;

    this.loading = true;
    this.scenarioError = '';
    this.cdr.detectChanges();

    const isAdoption = this.adoptionMode === 'adoption';
    const request$ = isAdoption
      ? this.scenarioDataService.postAdoptionScenarios(file, this.candidateEmployees)
      : this.scenarioDataService.postCsvAndGetScenarios(file);

    request$.subscribe({
      next: (scenarios: Scenario[]) => {
        const validScenarios = (scenarios || []).filter((s): s is Scenario => !!s && s.id !== undefined && s.id !== null);

        if (isAdoption && validScenarios) {
          validScenarios.forEach(s => {
            (s as any).isAdoptionResult = true;
          });
        }

        this.scenarios = validScenarios;

        // ★ 通常モード（100名）で取得した最初の結果を絶対的なキャッシュとして保持
        if (!isAdoption && validScenarios.length > 0) {
          this.base100Scenarios = JSON.parse(JSON.stringify(validScenarios));
        }

        if (validScenarios.length > 0) {
          this.selectedScenarioId = validScenarios[0].id;
        }

        this.loading = false;
        this.cdr.detectChanges();
      },
      error: (error: any) => {
        console.error('最適化通信エラー:', error);
        this.scenarios = [];
        this.scenarioError = '最適化結果を取得できませんでした。';
        this.loading = false;
        this.cdr.detectChanges();
      }
    });
  }
}