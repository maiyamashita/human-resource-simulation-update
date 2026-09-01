import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Scenario } from '../models/scenario.model';
import { CandidateEmployee } from '../components/adoption-control/adoption-control.component';

// ==================================================
// ★ 手動調整（What-if）用インターフェース
// ==================================================

/** 手動調整用にバックエンドへ送信する社員1行分のデータ */
export interface ManualEmployeeInput {
  employee_id: string;
  sales: number;
  management: number;
  development: number;
  training: number;
  personnel_cost: number;
  assigned_dept: string;     // 手動配置された事業部 ('A' | 'B' | 'C')
  preferred_dept?: string;   // 希望事業部（あれば）
}

/** バックエンド（/api/scenarios/recalculate）からの返却型 */
export interface RecalculateResponse {
  scenario: Scenario;
  meta: {
    totalCost?: number;
    preferredMatchCount?: number;
    preferredMatchRate?: number;
    alerts: Array<{
      level: 'error' | 'warning' | 'info';
      code?: string;
      department?: string;
      message: string;
    }>;
  };
}

export interface ScenarioResponse {
  scenarios: Scenario[];
}

@Injectable({
  providedIn: 'root'
})
export class ScenarioDataService {

  // 100名 通常モード用API URL
  private readonly apiUrl = '/api/scenarios';
  // 追加採用 モード用API URL
  private readonly adoptionApiUrl = '/api/scenarios/with-adoption';
  // 手動調整・リアルタイム再計算用API URL
  private readonly recalculateApiUrl = '/api/scenarios/recalculate';
  // 目標売上動的再最適化用API URL
  private readonly reoptimizeApiUrl = '/api/scenarios/reoptimize';

  // inject 関数を使用して確実に依存注入（NG2003 エラー回避）
  private http = inject(HttpClient);

  constructor() {}

  /**
   * 既存の100名用 API呼び出し (通常モード)
   */
  postCsvAndGetScenarios(file: File): Observable<Scenario[]> {
    const formData = new FormData();
    formData.append('file', file, file.name);

    return this.http
      .post<ScenarioResponse>(this.apiUrl, formData)
      .pipe(
        map((response: any) => response.scenarios)
      );
  }

  /**
   * 追加採用用 (101〜110名可変) API呼び出し
   * CSVファイルと、画面で設定した追加候補者データを同時に送信します
   */
  postAdoptionScenarios(file: File, candidates: CandidateEmployee[]): Observable<Scenario[]> {
    const formData = new FormData();
    formData.append('file', file, file.name);
    formData.append('candidates_json', JSON.stringify(candidates));

    return this.http
      .post<ScenarioResponse>(this.adoptionApiUrl, formData)
      .pipe(
        map((response: any) => response.scenarios)
      );
  }

  /**
   * 手動配置変更時のリアルタイム再計算 API呼び出し
   * @param employees 画面で配置変更された全社員のリスト
   * @param targetSales ユーザーが設定した目標売上（デフォルト: 58.0）
   * @returns 再計算された Scenario オブジェクトと警告（alerts）等のメタ情報
   */
  recalculateManualAssignment(employees: ManualEmployeeInput[], targetSales = 58.0): Observable<RecalculateResponse> {
    return this.http.post<RecalculateResponse>(this.recalculateApiUrl, {
      employees,
      target_sales: targetSales
    });
  }

  /**
   * 目標売上をもとに4つのシナリオを一括で再最適化する API呼び出し
   * @param targetSales ユーザーが入力した新しい目標売上（億円）
   * @param employees 現在の全社員データ
   * @returns 再最適化された4つのシナリオ一覧
   */
  reoptimizeWithTargetSales(targetSales: number, employees: any[]): Observable<Scenario[]> {
    return this.http
      .post<ScenarioResponse>(this.reoptimizeApiUrl, {
        target_sales: targetSales,
        employees
      })
      .pipe(
        map((response: any) => response.scenarios)
      );
  }
}