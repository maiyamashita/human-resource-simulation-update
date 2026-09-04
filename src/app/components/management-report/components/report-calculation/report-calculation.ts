// src/app/components/management-report/components/report-calculation/report-calculation.ts

import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-report-calculation',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './report-calculation.html',
  styleUrl: './report-calculation.css'
})
export class ReportCalculationComponent {
  // HTML側は固定の定義文言・数式・テーブルで完結しているため、
  // 現時点では特別なロジックや Input プロパティは不要です。
}