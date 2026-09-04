// src/app/models/scenario.model.ts

export type Department = 'A' | 'B' | 'C';

export interface DepartmentResult {
  count: number;
  ability: number;
  sales: number;
  profit: number;
}

/** バックエンドから返却される希望合致率データ */
export interface PreferenceMatchResult {
  firstChoiceMatchCount: number;  // 第1希望一致人数
  secondChoiceMatchCount: number; // 第2希望一致人数
  matchRate: number;              // 総合希望合致率 (%)
  totalCount: number;             // 対象社員数
}

/** 経営会議向け数値主体の方針カード型 */
export interface DepartmentPolicy {
  deptKey: Department;
  deptName: string;
  roleSummary: string;         // 例: 「収益基盤の維持・管理重視」
  memberCount: number;
  avgSales: number;            // 配置メンバー平均営業力
  avgManagement: number;       // 配置メンバー平均管理力
  avgDevelopment: number;      // 配置メンバー平均開拓力
  avgTraining: number;         // 配置メンバー平均育成力
  keySkillFocus: string;       // 例: 「管理力 (78.5pt) に特化」
  rationaleText: string;       // 2〜3行の定量的理由
}

export interface Scenario {
  id: number;
  name: string;
  shortName: string;
  objective: string;
  objectiveValue: number;
  totalSales: number;
  totalProfit: number;

  departments: {
    A: DepartmentResult;
    B: DepartmentResult;
    C: DepartmentResult;
  };
  assignment: {
    A: string[];
    B: string[];
    C: string[];
  };

  // 適正人数・最低人数（バックエンドのdynamic_optimizer.calculate_dynamic_settings()が算出した値）
  appropriateCounts?: Record<Department, number>;
  minimumCounts?: Record<Department, number>;

  // ★ バックエンドから返却される全社希望合致率データ
  preferenceMatch?: PreferenceMatchResult;

  // ★ 経営会議向け構造化方針（フロント側で動的生成）
  departmentPolicies?: Record<Department, DepartmentPolicy>;
}

// ★ 全体で一貫して使用する Employee インターフェース定義
export interface Employee {
  id: string | number;
  name?: string; // 日本語氏名（自動生成用）

  salesAbility: number;
  managementAbility: number;
  developmentAbility: number;
  trainingAbility: number;

  personnelCost: number;

  department?: 'A' | 'B' | 'C' | '';
}