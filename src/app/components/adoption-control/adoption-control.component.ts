// src/app/components/adoption-control.ts

import { Component, EventEmitter, Input, Output, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export type AdoptionMode = 'standard' | 'adoption';

/**
 * 追加採用時の最適化方式
 *
 * all   : 既存100名 + 追加採用者をまとめて再配置
 * fixed : 既存100名の配置を固定し、追加採用者のみ配置
 */
export type AdoptionOptimizationMode = 'all' | 'fixed';

export interface CandidateEmployee {
  id: string;
  name: string;
  sales_ability: number;      // 営業力 (0~100)
  management_ability: number; // 管理力 (0~100)
  development_ability: number;// 開拓力 (0~100)
  training_ability: number;   // 育成力 (0~100)
  cost: number;               // 人件費 (1~20)
}

export interface PersonaToApply {
  sales: number;
  management: number;
  development: number;
  training: number;
  cost: number;
}

@Component({
  selector: 'app-adoption-control',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <section class="mode-selection-section">
      <div class="mode-card">
        <div class="mode-header">
          <span class="mode-label">シミュレーション条件設定</span>
          <h3>採用枠・組織規模の選択</h3>
        </div>

        <div class="mode-toggle-group">
          <button 
            type="button"
            class="mode-btn"
            [class.active]="mode === 'standard'"
            (click)="selectMode('standard')"
          >
            <span class="badge">通常</span>
            <strong>既存 100名</strong>
            <small>現行組織での最適化</small>
          </button>

          <button 
            type="button"
            class="mode-btn"
            [class.active]="mode === 'adoption'"
            (click)="selectMode('adoption')"
          >
            <span class="badge highlight">追加採用</span>
            <strong>追加採用比較 ({{ 100 + selectedCount }}名)</strong>
            <small>+1〜10名の採用効果を検証</small>
          </button>
        </div>

        @if (mode === 'adoption') {
          <div class="adoption-detail-panel">

            <!-- 追加採用後の配置方法（セグメントスイッチ形式） -->
            <div class="optimization-mode-section">
              <div class="optimization-mode-header">
                <span class="optimization-title">配置方法:</span>
                <span class="optimization-desc">既存100名の配置を維持するか再配置するか</span>
              </div>

              <div class="segment-control">
                <button
                  type="button"
                  class="segment-btn"
                  [class.active]="optimizationMode === 'all'"
                  (click)="selectOptimizationMode('all')"
                >
                  <strong>一括最適化</strong>
                  <small>（100名＋採用者を再配置）</small>
                </button>

                <button
                  type="button"
                  class="segment-btn"
                  [class.active]="optimizationMode === 'fixed'"
                  (click)="selectOptimizationMode('fixed')"
                >
                  <strong>100名固定</strong>
                  <small>（既存配置を維持）</small>
                </button>
              </div>
            </div>

            <div class="count-selector-container">
              <div class="count-selector-top-row">
                <div class="count-selector-left">
                  <label for="adoption-count-input" class="count-label">追加採用人数:</label>
                  <div class="input-count-wrapper">
                    <span class="prefix">+</span>
                    <input 
                      id="adoption-count-input"
                      type="number" 
                      min="1" 
                      max="10" 
                      [(ngModel)]="selectedCount"
                      (ngModelChange)="onCountInputChange($event)"
                      class="input-count-number"
                    />
                    <span class="unit">名</span>
                  </div>
                  <span class="count-total-info">（計 {{ 100 + selectedCount }} 名体制）</span>
                </div>

                <button type="button" class="btn-toggle-detail" (click)="toggleDetail()">
                  {{ isDetailOpen ? '▲ 入力枠をたたむ' : '候補者能力設定を表示 (開く)' }}
                </button>
              </div>

              <div class="execution-action-area-top">
                <button 
                  type="button" 
                  class="btn-execute-simulation-primary"
                  (click)="executeSimulation()"
                >
                  この条件で再シミュレーションを実行 (+{{ selectedCount }}名)
                </button>
              </div>
            </div>

            @if (isDetailOpen) {
              <div class="candidates-table-wrapper">
                <div class="table-header-title">
                  <h4>採用候補者（{{ candidates.length }}名）のステータス設定</h4>
                </div>

                <div class="table-scroll-container">
                  <table class="candidates-table">
                    <thead>
                      <tr>
                        <th class="col-id">ID</th>
                        <th class="col-name">氏名</th>
                        <th class="col-skill">営業力</th>
                        <th class="col-skill">管理力</th>
                        <th class="col-skill">開拓力</th>
                        <th class="col-skill">育成力</th>
                        <th class="col-cost">人件費</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (candidate of candidates; track candidate.id; let i = $index) {
                        <tr>
                          <td class="col-id">
                            <span class="candidate-badge">#{{ candidate.id }}</span>
                          </td>
                          <td class="col-name">
                            <input 
                              type="text" 
                              [(ngModel)]="candidate.name" 
                              (blur)="validateCandidateName(candidate, i)"
                              class="input-name" 
                              [placeholder]="getDefaultCandidateName(i)"
                            />
                          </td>
                          <td class="col-skill">
                            <input type="number" min="0" max="100" [(ngModel)]="candidate.sales_ability" class="input-skill" />
                          </td>
                          <td class="col-skill">
                            <input type="number" min="0" max="100" [(ngModel)]="candidate.management_ability" class="input-skill" />
                          </td>
                          <td class="col-skill">
                            <input type="number" min="0" max="100" [(ngModel)]="candidate.development_ability" class="input-skill" />
                          </td>
                          <td class="col-skill">
                            <input type="number" min="0" max="100" [(ngModel)]="candidate.training_ability" class="input-skill" />
                          </td>
                          <td class="col-cost">
                            <input type="number" min="1" max="20" [(ngModel)]="candidate.cost" class="input-cost" />
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }

          </div>
        }
      </div>
    </section>
  `,
  styleUrl: './adoption-control.component.css'
})
export class AdoptionControlComponent {
  private cdr = inject(ChangeDetectorRef);

  @Input() mode: AdoptionMode = 'standard';

  /**
   * 追加採用時の最適化方式
   * all   = 一括最適化
   * fixed = 100名固定
   */
  @Input() optimizationMode: AdoptionOptimizationMode = 'all';

  @Output() modeChange = new EventEmitter<AdoptionMode>();
  @Output() candidatesChange = new EventEmitter<CandidateEmployee[]>();

  @Output() optimizationModeChange =
    new EventEmitter<AdoptionOptimizationMode>();

  isDetailOpen: boolean = true;
  selectedCount: number = 10;
  candidates: CandidateEmployee[] = [];

  private readonly DEFAULT_SURNAMES = [
    '高橋', '伊藤', '渡辺', '山本', '中村',
    '小林', '加藤', '吉田', '山田', '佐々木'
  ];

  private readonly DEFAULT_GIVEN_NAMES = [
    '健太', '大輔', '拓也', '翔太', '陽子',
    '麻衣', '裕子', '千尋', '結衣', '葵'
  ];

  constructor() {
    this.updateCandidatesList(this.selectedCount);
  }

  getDefaultCandidateName(index: number): string {
    const surname =
      this.DEFAULT_SURNAMES[index % this.DEFAULT_SURNAMES.length];

    const givenName =
      this.DEFAULT_GIVEN_NAMES[index % this.DEFAULT_GIVEN_NAMES.length];

    return `${surname} ${givenName}`;
  }

  validateCandidateName(
    candidate: CandidateEmployee,
    index: number
  ): void {
    if (!candidate.name || candidate.name.trim() === '') {
      candidate.name = this.getDefaultCandidateName(index);
    }
  }

  applyPersonaToCandidates(persona: PersonaToApply): void {
    this.candidates.forEach(c => {
      c.sales_ability = persona.sales;
      c.management_ability = persona.management;
      c.development_ability = persona.development;
      c.training_ability = persona.training;
      c.cost = persona.cost;
    });

    this.cdr.detectChanges();
  }

  toggleDetail(): void {
    this.isDetailOpen = !this.isDetailOpen;
  }

  selectMode(newMode: AdoptionMode): void {
    this.mode = newMode;
    this.modeChange.emit(newMode);

    if (newMode === 'standard') {
      this.candidatesChange.emit([]);
    }
  }

  /**
   * 追加採用時の最適化方式を変更する。
   * 方式を変更しただけではAPIを呼ばず、
   * 「この条件で再シミュレーションを実行」時に
   * candidatesChange と同じ流れで親側へ反映する。
   */
  selectOptimizationMode(
    newMode: AdoptionOptimizationMode
  ): void {
    this.optimizationMode = newMode;
    this.optimizationModeChange.emit(newMode);
    this.cdr.detectChanges();
  }

  onCountInputChange(newVal: number): void {
    if (!newVal || newVal < 1) {
      this.selectedCount = 1;
    } else if (newVal > 10) {
      this.selectedCount = 10;
    } else {
      this.selectedCount = newVal;
    }

    this.updateCandidatesList(this.selectedCount);
    this.cdr.detectChanges();
  }

  private updateCandidatesList(count: number): void {
    const defaultProposal = {
      sales_ability: 70,
      management_ability: 60,
      development_ability: 65,
      training_ability: 60,
      cost: 10
    };

    if (count > this.candidates.length) {
      for (
        let i = this.candidates.length;
        i < count;
        i++
      ) {
        const formattedIndex =
          String(i + 1).padStart(3, '0');

        const defaultName =
          this.getDefaultCandidateName(i);

        this.candidates.push({
          id: `A${formattedIndex}`,
          name: defaultName,
          sales_ability: defaultProposal.sales_ability,
          management_ability: defaultProposal.management_ability,
          development_ability: defaultProposal.development_ability,
          training_ability: defaultProposal.training_ability,
          cost: defaultProposal.cost
        });
      }
    } else {
      this.candidates =
        this.candidates.slice(0, count);
    }
  }

  executeSimulation(): void {
    this.candidates.forEach((c, i) =>
      this.validateCandidateName(c, i)
    );

    this.candidatesChange.emit(this.candidates);
  }
}