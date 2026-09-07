import {
  Component,
  Input,
  Output,
  EventEmitter,
  ViewChild
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { Scenario } from '../../models/scenario.model';
import { Employee } from '../../models/employee.model';
import { AdoptionPersona } from '../../services/scenario-data.service';

import {
  AdoptionControlComponent,
  AdoptionMode,
  AdoptionOptimizationMode,
  CandidateEmployee
} from '../adoption-control/adoption-control.component';

import { AdoptionDiffComponent } from '../adoption-diff/adoption-diff.component';
import { AdoptionThresholdComponent } from '../adoption-threshold/adoption-threshold.component';

export interface AdoptionSnapshot {
  id: string;
  name: string;
  createdAt: Date;
  candidates: CandidateEmployee[];
  candidateCount: number;
  salesDiff: number;
  profitDiff: number;
  scenarioId: number;
}

@Component({
  selector: 'app-adoption-view',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    AdoptionControlComponent,
    AdoptionDiffComponent,
    AdoptionThresholdComponent
  ],
  templateUrl: './adoption-view.component.html',
  styleUrl: './adoption-view.component.css'
})
export class AdoptionViewComponent {

  @Input() selectedScenario: Scenario | null = null;
  @Input() selectedBase100Scenario: Scenario | null = null;
  @Input() base100Scenarios: Scenario[] = [];
  @Input() targetSales = 58.0;
  @Input() employees: Employee[] = [];
  @Input() adoptionMode: AdoptionMode = 'standard';

  // ★ 追加採用時の最適化方式
  // all   : 既存100名 + 追加採用者を一括最適化
  // fixed : 既存100名の配置を固定し、追加採用者のみ配置
  @Input() optimizationMode: AdoptionOptimizationMode = 'all';

  @Input() candidateEmployees: CandidateEmployee[] = [];

  @Input() snapshots: AdoptionSnapshot[] = [];
  @Output() snapshotsChange =
    new EventEmitter<AdoptionSnapshot[]>();

  @Output() modeChange =
    new EventEmitter<AdoptionMode>();

  // ★ 最適化方式変更を親へ通知
  @Output() optimizationModeChange =
    new EventEmitter<AdoptionOptimizationMode>();

  @Output() candidatesChange =
    new EventEmitter<CandidateEmployee[]>();

  @Output() csvSelected =
    new EventEmitter<Event>();

  @ViewChild(AdoptionControlComponent)
  adoptionControlRef?: AdoptionControlComponent;

  newSnapshotName = '';

  private draftCandidates: CandidateEmployee[] = [];

  activeSnapshotId: string | null = null;

  /**
   * 試算が実行され、有効な計算結果が存在するかを判定するゲッター
   * 試算実行後は true となり、画面左上の配置が「改善効果結果（純増利益）」へ自動昇格します
   */
  get isAdoptionCalculated(): boolean {
    return this.adoptionMode === 'adoption' &&
           !!this.selectedScenario &&
           (this.selectedScenario as any).isAdoptionResult === true &&
           this.candidateEmployees.length > 0;
  }

  get isDirty(): boolean {
    if (
      this.adoptionMode !== 'adoption' ||
      this.candidateEmployees.length === 0
    ) {
      return false;
    }

    if (!this.activeSnapshotId) {
      return true;
    }

    const activeSn = this.snapshots.find(
      s => s.id === this.activeSnapshotId
    );

    if (!activeSn) {
      return true;
    }

    return (
      JSON.stringify(this.candidateEmployees) !==
      JSON.stringify(activeSn.candidates)
    );
  }

  onModeChange(mode: AdoptionMode): void {
    if (
      mode === 'standard' &&
      this.candidateEmployees.length > 0
    ) {
      this.draftCandidates =
        JSON.parse(
          JSON.stringify(this.candidateEmployees)
        );

    } else if (
      mode === 'adoption' &&
      this.candidateEmployees.length === 0 &&
      this.draftCandidates.length > 0
    ) {
      this.candidatesChange.emit(
        JSON.parse(
          JSON.stringify(this.draftCandidates)
        )
      );
    }

    this.modeChange.emit(mode);
  }

  /**
   * ★ 追加採用時の最適化方式変更
   *
   * AdoptionControlComponentから受け取った方式を
   * 自分自身にも反映し、親のAppComponentへ中継する。
   */
  onOptimizationModeChange(
    mode: AdoptionOptimizationMode
  ): void {
    this.optimizationMode = mode;
    this.optimizationModeChange.emit(mode);
  }

  onCandidatesChange(
    candidates: CandidateEmployee[]
  ): void {
    this.candidatesChange.emit(candidates);
  }

  onApplyPersona(
    persona: AdoptionPersona
  ): void {
    this.adoptionControlRef?.applyPersonaToCandidates(
      persona
    );
  }

  onCsvFileChange(event: Event): void {
    this.csvSelected.emit(event);
  }

  saveCurrentSnapshot(): void {
    if (
      !this.selectedScenario ||
      !this.selectedBase100Scenario
    ) {
      return;
    }

    const salesDiff =
      (this.selectedScenario.totalSales || 0) -
      (this.selectedBase100Scenario.totalSales || 0);

    const profitDiff =
      (this.selectedScenario.totalProfit || 0) -
      (this.selectedBase100Scenario.totalProfit || 0);

    const count =
      this.candidateEmployees.length;

    const name =
      this.newSnapshotName.trim() ||
      `追加試算 (${count}名体制)`;

    const newSnapshotId =
      Date.now().toString();

    const snapshot: AdoptionSnapshot = {
      id: newSnapshotId,
      name,
      createdAt: new Date(),
      candidates: JSON.parse(
        JSON.stringify(this.candidateEmployees)
      ),
      candidateCount: count,
      salesDiff,
      profitDiff,
      scenarioId: this.selectedScenario.id
    };

    const updated = [
      snapshot,
      ...this.snapshots
    ];

    this.snapshotsChange.emit(updated);

    this.activeSnapshotId =
      newSnapshotId;

    this.newSnapshotName = '';
  }

  deleteSnapshot(id: string): void {
    const updated =
      this.snapshots.filter(
        s => s.id !== id
      );

    this.snapshotsChange.emit(updated);

    if (
      this.activeSnapshotId === id
    ) {
      this.activeSnapshotId = null;
    }
  }

  applySnapshot(
    snapshot: AdoptionSnapshot
  ): void {
    this.activeSnapshotId =
      snapshot.id;

    this.onModeChange('adoption');

    this.onCandidatesChange(
      JSON.parse(
        JSON.stringify(snapshot.candidates)
      )
    );
  }
}