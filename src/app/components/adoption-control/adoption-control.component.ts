// src/app/components/adoption-control.ts

import { Component, EventEmitter, Input, Output, ChangeDetectorRef, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export type AdoptionMode = 'standard' | 'adoption';

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
          <!-- 100名 通常モード -->
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

          <!-- 追加採用シミュレーションモード -->
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

        <!-- 追加採用モード時の設定パネル -->
        @if (mode === 'adoption') {
          <div class="adoption-detail-panel">

            <!-- 人数設定 ＆ ★再シミュレーション実行ボタン（上部固定配置） ★ -->
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

              <!-- ★ 下部にあった再実行ボタンを最上部へ引越し配置 ★ -->
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

            <!-- 候補者一覧入力テーブル（200pxスクロールエリア化） -->
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
  styles: [`
    .mode-selection-section { margin-bottom: 0; }
    .mode-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px 14px;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }
    .mode-header { margin-bottom: 10px; }
    .mode-header .mode-label { font-size: 0.65rem; font-weight: 700; color: #2563eb; }
    .mode-header h3 { margin: 2px 0 0 0; font-size: 0.88rem; font-weight: 800; color: #0f172a; }

    .mode-toggle-group { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .mode-btn {
      display: flex; flex-direction: column; align-items: flex-start;
      padding: 8px 10px; background: #f8fafc; border: 1.5px solid #e2e8f0;
      border-radius: 6px; cursor: pointer; transition: all 0.15s ease; text-align: left;
    }
    .mode-btn:hover { border-color: #cbd5e1; background: #f1f5f9; }
    .mode-btn.active { border-color: #2563eb; background: #eff6ff; }
    .mode-btn .badge { font-size: 0.6rem; font-weight: 700; padding: 1px 5px; border-radius: 3px; background: #e2e8f0; color: #475569; margin-bottom: 4px; }
    .mode-btn .badge.highlight { background: #dbeafe; color: #1d4ed8; }
    .mode-btn.active .badge.highlight { background: #2563eb; color: #ffffff; }
    .mode-btn strong { font-size: 0.78rem; color: #0f172a; font-weight: 800; }
    .mode-btn small { font-size: 0.62rem; color: #64748b; }

    .adoption-detail-panel { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1; }
    
    .count-selector-container {
      display: flex; flex-direction: column; gap: 8px;
      background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0;
    }
    .count-selector-top-row { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
    .count-selector-left { display: flex; align-items: center; gap: 8px; }
    .count-label { font-size: 0.72rem; font-weight: 700; color: #334155; }
    
    .input-count-wrapper {
      display: inline-flex; align-items: center; background: #ffffff;
      border: 1px solid #2563eb; border-radius: 4px; padding: 1px 6px;
    }
    .input-count-wrapper .prefix { font-size: 0.75rem; font-weight: 700; color: #2563eb; margin-right: 2px; }
    .input-count-number { width: 42px; font-size: 0.75rem; font-weight: 700; color: #1e293b; border: none; outline: none; text-align: center; }
    .input-count-wrapper .unit { font-size: 0.68rem; font-weight: 600; color: #475569; }
    .count-total-info { font-size: 0.68rem; color: #64748b; }

    .btn-toggle-detail {
      background: #ffffff; border: 1px solid #cbd5e1; color: #2563eb;
      font-size: 0.65rem; font-weight: 700; cursor: pointer; padding: 3px 8px; border-radius: 4px;
    }

    /* 上部に固定したメイン実行ボタン */
    .execution-action-area-top { width: 100%; margin-top: 2px; }
    .btn-execute-simulation-primary {
      width: 100%; background: #1d4ed8; color: #ffffff; font-weight: 800; font-size: 0.75rem;
      padding: 6px 12px; border: none; border-radius: 5px; cursor: pointer;
      box-shadow: 0 2px 4px rgba(29, 78, 216, 0.2); transition: background 0.15s ease;
    }
    .btn-execute-simulation-primary:hover { background: #1e40af; }

    .candidates-table-wrapper { margin-top: 8px; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; background: #ffffff; }
    .table-header-title { padding: 6px 10px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; }
    .table-header-title h4 { margin: 0; font-size: 0.68rem; font-weight: 800; color: #475569; }

    .table-scroll-container { max-height: 180px; overflow-y: auto; }
    .candidates-table { width: 100%; border-collapse: collapse; font-size: 0.68rem; }
    .candidates-table th { background: #f1f5f9; color: #475569; font-weight: 700; padding: 4px 6px; border-bottom: 1px solid #e2e8f0; position: sticky; top: 0; z-index: 1; }
    .candidates-table td { padding: 3px 6px; border-bottom: 1px solid #f1f5f9; vertical-align: middle; }

    .col-id { width: 55px; text-align: center; }
    .candidate-badge { font-size: 0.6rem; font-weight: 700; color: #1e40af; background: #dbeafe; padding: 1px 4px; border-radius: 3px; }
    .col-name { min-width: 90px; }
    .input-name { width: 100%; font-size: 0.68rem; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 3px; outline: none; }
    .col-skill { width: 50px; text-align: center; }
    .input-skill { width: 42px; padding: 2px 2px; font-size: 0.68rem; border: 1px solid #cbd5e1; border-radius: 3px; text-align: right; outline: none; }
    .col-cost { width: 55px; text-align: center; background: #faf5ff; }
    .candidates-table th.col-cost { background: #f3e8ff; color: #6b21a8; }
    .input-cost { width: 42px; padding: 2px 2px; font-size: 0.68rem; border: 1px solid #c084fc; border-radius: 3px; text-align: right; background: #ffffff; font-weight: 700; color: #6b21a8; outline: none; }
  `]
})
export class AdoptionControlComponent {
  private cdr = inject(ChangeDetectorRef);

  @Input() mode: AdoptionMode = 'standard';

  @Output() modeChange = new EventEmitter<AdoptionMode>();
  @Output() candidatesChange = new EventEmitter<CandidateEmployee[]>();

  isDetailOpen: boolean = true;
  selectedCount: number = 10;
  candidates: CandidateEmployee[] = [];

  private readonly DEFAULT_SURNAMES = ['高橋', '伊藤', '渡辺', '山本', '中村', '小林', '加藤', '吉田', '山田', '佐々木'];
  private readonly DEFAULT_GIVEN_NAMES = ['健太', '大輔', '拓也', '翔太', '陽子', '麻衣', '裕子', '千尋', '結衣', '葵'];

  constructor() {
    this.updateCandidatesList(this.selectedCount);
  }

  getDefaultCandidateName(index: number): string {
    const surname = this.DEFAULT_SURNAMES[index % this.DEFAULT_SURNAMES.length];
    const givenName = this.DEFAULT_GIVEN_NAMES[index % this.DEFAULT_GIVEN_NAMES.length];
    return `${surname} ${givenName}`;
  }

  validateCandidateName(candidate: CandidateEmployee, index: number): void {
    if (!candidate.name || candidate.name.trim() === '') {
      candidate.name = this.getDefaultCandidateName(index);
    }
  }

  applyPersonaToCandidates(persona: PersonaToApply) {
    this.candidates.forEach(c => {
      c.sales_ability = persona.sales;
      c.management_ability = persona.management;
      c.development_ability = persona.development;
      c.training_ability = persona.training;
      c.cost = persona.cost;
    });
    this.cdr.detectChanges();
  }

  toggleDetail() {
    this.isDetailOpen = !this.isDetailOpen;
  }

  selectMode(newMode: AdoptionMode) {
    this.mode = newMode;
    this.modeChange.emit(newMode);

    if (newMode === 'standard') {
      this.candidatesChange.emit([]);
    }
  }

  onCountInputChange(newVal: number) {
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

  private updateCandidatesList(count: number) {
    const defaultProposal = {
      sales_ability: 70, management_ability: 60, development_ability: 65, training_ability: 60, cost: 10
    };

    if (count > this.candidates.length) {
      for (let i = this.candidates.length; i < count; i++) {
        const formattedIndex = String(i + 1).padStart(3, '0');
        const defaultName = this.getDefaultCandidateName(i);

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
      this.candidates = this.candidates.slice(0, count);
    }
  }

  executeSimulation() {
    this.candidates.forEach((c, i) => this.validateCandidateName(c, i));
    this.candidatesChange.emit(this.candidates);
  }
}