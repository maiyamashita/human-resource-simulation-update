import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './header.html',
  styleUrl: './header.css'
})
export class HeaderComponent {
  // ガイドモーダル（ポップアップ）の開閉フラグ
  isGuideOpen = false;

  // モーダル開閉トグル
  openGuide() {
    this.isGuideOpen = true;
  }

  closeGuide() {
    this.isGuideOpen = false;
  }
}