//このファイル名はsrc/app/services/scenario-data.service.tsです。

import { Injectable, inject, isDevMode } from '@angular/core';
import { HttpClient } from '@angular/common/http';

import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

import { Scenario } from '../models/scenario.model';
import {
  CandidateEmployee,
  AdoptionOptimizationMode
} from '../components/adoption-control/adoption-control.component';

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

// ==================================================
// ★ 必要人材の目安（4ペルソナ x 4シナリオ 必要人数試算）用インターフェース
// ==================================================

/** バックエンド app/persona_definitions.py の4タイプ（正式なペルソナ定義） */
export interface AdoptionPersona {
  key: string;
  label: string;
  sales: number;
  management: number;
  development: number;
  training: number;
  cost: number;
}

export interface AdoptionThresholdScenario {
  id: number;
  shortName: string;
  mode: string;
}

export interface AdoptionThresholdAttempt {
  count: number;
  totalSales: number;
  totalProfit: number;
}

export interface AdoptionThresholdResult {
  personaKey: string;
  scenarioId: number;
  reached: boolean;
  minCount: number | null;
  totalSales: number | null;
  totalProfit: number | null;
  gap: number | null;
  attempts: AdoptionThresholdAttempt[];
}

export interface AdoptionThresholdResponse {
  personas: AdoptionPersona[];
  scenarios: AdoptionThresholdScenario[];
  targetSales: number;
  maxCount: number;
  results: AdoptionThresholdResult[];
  isEstimate: boolean;
}

/**
 * /api/scenarios/adoption-threshold へ送信する「現在の100名の配置」
 * （既存4シナリオそれぞれの部門別人数・能力値・売上）のベースラインデータ。
 * 概算計算のみに使用し、CP-SATは呼ばない。
 */
export interface AdoptionThresholdBaselineDepartment {
  count: number;
  ability: number;
  sales: number;
}

export interface AdoptionThresholdBaselineScenario {
  id: number;
  mode: string;
  totalSales: number;
  totalProfit: number;
  departments: {
    A: AdoptionThresholdBaselineDepartment;
    B: AdoptionThresholdBaselineDepartment;
    C: AdoptionThresholdBaselineDepartment;
  };
}

@Injectable({
  providedIn: 'root'
})
export class ScenarioDataService {

  // --------------------------------------------------
  // ★ API接続先ベースURL（ローカル開発と本番環境で自動切替）
  // --------------------------------------------------
  // ng serve (ローカル開発時) ➔ 'http://localhost:8000'
  // ng build (本番Render環境) ➔ 'https://backend-w5zi.onrender.com'
  private readonly baseUrl = isDevMode()
    ? 'http://localhost:8000'
    : 'https://backend-w5zi.onrender.com';

  // 100名 通常モード用API URL
  private readonly apiUrl = `${this.baseUrl}/api/scenarios`;

  // 追加採用 モード用API URL
  private readonly adoptionApiUrl =
    `${this.baseUrl}/api/scenarios/with-adoption`;

  // 手動調整・リアルタイム再計算用API URL
  private readonly recalculateApiUrl =
    `${this.baseUrl}/api/scenarios/recalculate`;

  // 目標売上動的再最適化用API URL
  private readonly reoptimizeApiUrl =
    `${this.baseUrl}/api/scenarios/reoptimize`;

  // 必要人材の目安（4ペルソナ x 4シナリオ）試算用API URL
  private readonly adoptionThresholdApiUrl =
    `${this.baseUrl}/api/scenarios/adoption-threshold`;

  // inject 関数を使用して確実に依存注入（NG2003 エラー回避）
  private http = inject(HttpClient);

  constructor() {}

  /**
   * 既存の100名用 API呼び出し (通常モード)
   */
  postCsvAndGetScenarios(
    file: File
  ): Observable<Scenario[]> {
    const formData = new FormData();

    formData.append(
      'file',
      file,
      file.name
    );

    return this.http
      .post<ScenarioResponse>(
        this.apiUrl,
        formData
      )
      .pipe(
        map(
          (response: any) =>
            response.scenarios
        )
      );
  }

  /**
   * 追加採用用 (101〜110名可変) API呼び出し
   *
   * CSVファイルと、画面で設定した追加候補者データ、
   * 追加採用後の最適化方式を同時に送信します。
   *
   * optimizationMode:
   *   all   = 既存100名 + 追加採用者を一括最適化
   *   fixed = 既存100名の配置を固定し、追加採用者のみ配置
   */
  postAdoptionScenarios(
    file: File,
    candidates: CandidateEmployee[],
    optimizationMode: AdoptionOptimizationMode
  ): Observable<Scenario[]> {

    const formData = new FormData();

    formData.append(
      'file',
      file,
      file.name
    );

    formData.append(
      'candidates_json',
      JSON.stringify(candidates)
    );

    // ★ 追加採用後の最適化方式をバックエンドへ送信
    formData.append(
      'optimization_mode',
      optimizationMode
    );

    return this.http
      .post<ScenarioResponse>(
        this.adoptionApiUrl,
        formData
      )
      .pipe(
        map(
          (response: any) =>
            response.scenarios
        )
      );
  }

  /**
   * 手動配置変更時のリアルタイム再計算 API呼び出し
   * @param employees 画面で配置変更された全社員のリスト
   * @param targetSales ユーザーが設定した目標売上（デフォルト: 58.0）
   * @returns 再計算された Scenario オブジェクトと警告（alerts）等のメタ情報
   */
  recalculateManualAssignment(
    employees: ManualEmployeeInput[],
    targetSales = 58.0
  ): Observable<RecalculateResponse> {
    return this.http.post<RecalculateResponse>(
      this.recalculateApiUrl,
      {
        employees,
        target_sales: targetSales
      }
    );
  }

  /**
   * 目標売上をもとに4つのシナリオを一括で再最適化する API呼び出し
   * @param targetSales ユーザーが入力した新しい目標売上（億円）
   * @param employees 現在の全社員データ
   * @returns 再最適化された4つのシナリオ一覧
   */
  reoptimizeWithTargetSales(
    targetSales: number,
    employees: any[]
  ): Observable<Scenario[]> {
    return this.http
      .post<ScenarioResponse>(
        this.reoptimizeApiUrl,
        {
          target_sales: targetSales,
          employees
        }
      )
      .pipe(
        map(
          (response: any) =>
            response.scenarios
        )
      );
  }

  /**
   * 必要人材の目安（4ペルソナ x 4シナリオ）概算試算 API呼び出し
   * CP-SATは使用せず、課題仕様の直接計算式による概算のみを行う。
   * @param baselineScenarios 「現在の100名の配置」＝既存4シナリオの部門別データ
   * @param targetSales ユーザーが設定した目標売上（億円）
   * @returns 4ペルソナ x 4シナリオ分の必要最小人数の概算試算結果
   */
  getAdoptionThreshold(
    baselineScenarios: AdoptionThresholdBaselineScenario[],
    targetSales: number
  ): Observable<AdoptionThresholdResponse> {
    return this.http.post<AdoptionThresholdResponse>(
      this.adoptionThresholdApiUrl,
      {
        baseline_scenarios: baselineScenarios,
        target_sales: targetSales
      }
    );
  }
}
