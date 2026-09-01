import { Component, EventEmitter, Input, Output } from '@angular/core';
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

// 戦略別の推奨ペルソナ定義
export interface PersonaProposal {
  typeLabel: string;
  description: string;
  sales_ability: number;
  management_ability: number;
  development_ability: number;
  training_ability: number;
  cost: number;
}

const PERSONA_PROPOSALS: Record<number, PersonaProposal> = {
  1: { typeLabel: 'バランス成長型', description: '全社の全体底上げを図るオールラウンドスペック', sales_ability: 75, management_ability: 60, development_ability: 75, training_ability: 65, cost: 12 },
  2: { typeLabel: '管理・収益効率型', description: 'A事業部の収益性とROIを高める高管理力・低コストスペック', sales_ability: 80, management_ability: 80, development_ability: 50, training_ability: 60, cost: 10 },
  3: { typeLabel: '営業・拡大特化型', description: 'B事業部の成長を最速化させる即戦力営業スペック', sales_ability: 85, management_ability: 60, development_ability: 70, training_ability: 60, cost: 13 },
  4: { typeLabel: '開拓特化型', description: 'C事業部の新規市場を切り拓く超開拓スペック', sales_ability: 65, management_ability: 50, development_ability: 90, training_ability: 65, cost: 14 },
};

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
            
            <!-- ★ 新設: 選択中シナリオに応じた戦略採用要件の自動提案エリア ★ -->
            @if (currentProposal) {
              <div class="persona-proposal-card">
                <div class="proposal-header">
                  <span class="proposal-badge">💡 戦略提案</span>
                  <strong>求める人物像: {{ currentProposal.typeLabel }}</strong>
                </div>
                <p class="proposal-desc">{{ currentProposal.description }}</p>
                
                <div class="proposal-stats">
                  <span>営業: <strong>{{ currentProposal.sales_ability }}</strong></span>
                  <span>管理: <strong>{{ currentProposal.management_ability }}</strong></span>
                  <span>開拓: <strong>{{ currentProposal.development_ability }}</strong></span>
                  <span>育成: <strong>{{ currentProposal.training_ability }}</strong></span>
                  <span>人件費: <strong>{{ currentProposal.cost }}百万円</strong></span>
                </div>

                <button type="button" class="btn-apply-persona" (click)="applyProposedPersona()">
                  ✨ この要件（能力値）を候補者{{ selectedCount }}名に一括反映する
                </button>
              </div>
            }

            <!-- 人数選択スライダー -->
            <div class="slider-container">
              <div class="slider-header">
                <span>追加採用人数: <strong>+{{ selectedCount }} 名</strong> (計 {{ 100 + selectedCount }} 名)</span>
                <button type="button" class="btn-toggle-detail" (click)="toggleDetail()">
                  {{ isDetailOpen ? '▲ 候補者の詳細設定をたたむ' : '▼ 候補者ごとの能力・コストを詳細設定する' }}
                </button>
              </div>
              <input 
                type="range" 
                min="1" 
                max="10" 
                [value]="selectedCount"
                (input)="onCountSliderChange($event)"
                class="count-slider"
              />
              <div class="slider-labels">
                <span>+1名</span>
                <span>+5名</span>
                <span>+10名</span>
              </div>
            </div>

            <!-- アコーディオン展開時の詳細設定 -->
            @if (isDetailOpen) {
              <div class="candidates-editor">
                <div class="editor-header">
                  <h4>採用候補者（{{ candidates.length }}名）のステータス設定</h4>
                </div>

                <div class="candidates-compact-list">
                  @for (candidate of candidates; track candidate.id; let i = $index) {
                    <div class="compact-candidate-row">
                      <span class="candidate-badge">候補者 {{ i + 1 }}</span>
                      
                      <input 
                        type="text" 
                        [(ngModel)]="candidate.name" 
                        class="input-name" 
                        placeholder="氏名"
                      />

                      <div class="skills-inline-group">
                        <label>営業 <input type="number" min="0" max="100" [(ngModel)]="candidate.sales_ability" /></label>
                        <label>管理 <input type="number" min="0" max="100" [(ngModel)]="candidate.management_ability" /></label>
                        <label>開拓 <input type="number" min="0" max="100" [(ngModel)]="candidate.development_ability" /></label>
                        <label>育成 <input type="number" min="0" max="100" [(ngModel)]="candidate.training_ability" /></label>
                        <label class="cost-label">人件費 <input type="number" min="1" max="20" [(ngModel)]="candidate.cost" class="input-cost" /></label>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }

            <!-- シミュレーション手動実行エリア -->
            <div class="execution-action-area">
              <button 
                type="button" 
                class="btn-execute-simulation"
                (click)="executeSimulation()"
              >
                <span class="icon">🚀</span>
                この条件で再シミュレーションを実行 (+{{ selectedCount }}名)
              </button>
            </div>

          </div>
        }
      </div>
    </section>
  `,
  styleUrl: './adoption-control.component.css'
})
export class AdoptionControlComponent {
  @Input() mode: AdoptionMode = 'standard';
  
  // ★ 新設: 選択中のシナリオIDを受け取る (1~4)
  @Input() selectedScenarioId: number = 1;

  @Output() modeChange = new EventEmitter<AdoptionMode>();
  @Output() candidatesChange = new EventEmitter<CandidateEmployee[]>();

  isDetailOpen: boolean = false;
  selectedCount: number = 10;
  candidates: CandidateEmployee[] = [];

  constructor() {
    this.updateCandidatesList(this.selectedCount);
  }

  // 選択中シナリオに応じた提案データを取得
  get currentProposal(): PersonaProposal | null {
    return PERSONA_PROPOSALS[this.selectedScenarioId] || null;
  }

  // ボタン押下時に推奨能力値を一括反映
  applyProposedPersona() {
    const proposal = this.currentProposal;
    if (!proposal) return;

    this.candidates.forEach(c => {
      c.sales_ability = proposal.sales_ability;
      c.management_ability = proposal.management_ability;
      c.development_ability = proposal.development_ability;
      c.training_ability = proposal.training_ability;
      c.cost = proposal.cost;
    });
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

  onCountSliderChange(event: Event) {
    this.selectedCount = +(event.target as HTMLInputElement).value;
    this.updateCandidatesList(this.selectedCount);
  }

  private updateCandidatesList(count: number) {
    const defaultProposal = this.currentProposal || {
      sales_ability: 70, management_ability: 60, development_ability: 65, training_ability: 60, cost: 10
    };

    if (count > this.candidates.length) {
      for (let i = this.candidates.length; i < count; i++) {
        this.candidates.push({
          id: `NEW_${i + 1}`,
          name: `採用候補者 ${i + 1}`,
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
    this.candidatesChange.emit(this.candidates);
  }
}