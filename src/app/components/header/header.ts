import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface SnapshotItem {
  id: string;
  name: string;
  timestamp: string;
}

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './header.html',
  styleUrl: './header.css'
})
export class HeaderComponent {
  @Input() targetSales = 58;
  @Input() adoptionMode: 'standard' | 'adoption' = 'standard';
  @Input() candidateCount = 0;
  
  // 保存済みスナップショット一覧
  @Input() snapshots: SnapshotItem[] = [];
  @Input() selectedSnapshotId = '';

  @Output() targetSalesChange = new EventEmitter<number>();
  @Output() openReport = new EventEmitter<void>();
  @Output() resetAdoption = new EventEmitter<void>();
  
  // ★ セーブデータ選択 ＆ 保存イベント
  @Output() loadSnapshot = new EventEmitter<string>();
  @Output() saveSnapshot = new EventEmitter<string>();

  // モーダル開閉状態
  isGuideOpen = false;
  isSaveModalOpen = false;
  newSnapshotName = '';

  openGuide(): void {
    this.isGuideOpen = true;
  }

  closeGuide(): void {
    this.isGuideOpen = false;
  }

  openSaveModal(): void {
    const defaultName = `会議案_${new Date().toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}_${new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
    this.newSnapshotName = defaultName;
    this.isSaveModalOpen = true;
  }

  closeSaveModal(): void {
    this.isSaveModalOpen = false;
  }

  onSaveConfirm(): void {
    if (this.newSnapshotName.trim()) {
      this.saveSnapshot.emit(this.newSnapshotName.trim());
      this.closeSaveModal();
    }
  }

  onSelectSnapshot(event: Event): void {
    const target = event.target as HTMLSelectElement;
    if (target && target.value) {
      this.loadSnapshot.emit(target.value);
    }
  }

  onTargetSalesChange(val: number): void {
    if (val && val > 0) {
      this.targetSalesChange.emit(val);
    }
  }

  onOpenReport(): void {
    this.openReport.emit();
  }

  onResetAdoption(): void {
    this.resetAdoption.emit();
  }
}