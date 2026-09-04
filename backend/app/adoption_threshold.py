#このファイル名はbackend/app/adoption_threshold.pyです。

# ============================================================
# 「必要人材の目安」機能（概算版）
#
# 課題仕様の直接計算式（貢献度→基本売上→最終売上→全社売上→利益）だけを使い、
# CP-SAT・optimize_dynamic_adoption()・人数ごとの最適化処理は一切使用しない。
#
# 目的は厳密な最適解ではなく、「このタイプを何人追加すると目標を
# 達成できそうか」という目安を高速（数秒以内）に算出すること。
#
# 「現在の100名の配置」＝既存4シナリオ(total_sales/a_profit/b_sales/c_sales)
# それぞれについて実際に計算済みの部門別人数・能力値・売上（/api/scenarios の
# レスポンス）をベースラインとして受け取り、そこに仮想人材を1〜10名追加した
# 場合の全社売上・利益を、department_calculator.py / contribution.py の
# 既存関数（純粋な算術計算のみ）でそのまま計算する。
#
# シナリオごとの追加人材の配属先（概算のための単純化した前提）:
#   ・a_profit(A利益最大化) → 常にA事業部へ配属
#   ・b_sales(B売上最大化)  → 常にB事業部へ配属
#   ・c_sales(C売上最大化)  → 常にC事業部へ配属
#   ・total_sales(全社売上最大化) → A/B/Cのうち、全社売上が最大になる
#     配属先を人数ごとに都度選ぶ（3パターンの単純比較のみ。CP-SAT不使用）
#
# 追加された部門以外は、既存の配置（ベースライン）のまま変化しないと
# 仮定する単純化されたモデルであり、厳密な最適配置ではない。
# ============================================================

from app.contribution import calculate_contribution, WEIGHTS
from app.department_calculator import (
    DEPARTMENT_SETTINGS,
    calculate_shortage_penalty,
    calculate_excess_penalty,
    calculate_sales,
)
from app.persona_definitions import PERSONAS

DEPARTMENTS = ["A", "B", "C"]

SCENARIOS = [
    {"id": 1, "shortName": "全社売上", "mode": "total_sales"},
    {"id": 2, "shortName": "A利益", "mode": "a_profit"},
    {"id": 3, "shortName": "B売上", "mode": "b_sales"},
    {"id": 4, "shortName": "C売上", "mode": "c_sales"},
]

# シナリオごとに配属先の事業部を固定する（total_salesのみ固定しない＝都度A/B/C比較）
FIXED_TARGET_DEPARTMENT = {
    "a_profit": "A",
    "b_sales": "B",
    "c_sales": "C",
}

# 追加採用は1〜10名まで対応(既存の業務ルールと同じ範囲)
MAX_COUNT = 10


def _department_sales(department, count, ability_value):
    """
    department_calculator.py の既存関数（不足/過剰補正・売上計算）のみを使い、
    人数・能力値から最終売上（億円）を直接計算する。CP-SAT不使用。
    """
    appropriate = DEPARTMENT_SETTINGS[department]["appropriate_count"]
    fulfillment_rate = (count / appropriate) if appropriate else 0.0

    department_result = {
        "department": department,
        "ability_value": ability_value,
        "fulfillment_rate": fulfillment_rate,
        "shortage_penalty": calculate_shortage_penalty(department, fulfillment_rate),
        "excess_penalty": calculate_excess_penalty(fulfillment_rate),
    }

    return calculate_sales(department_result)["final_sales"]


def _persona_contribution(persona_key, department):
    persona = PERSONAS[persona_key]
    employee = {
        "sales": persona["sales"],
        "management": persona["management"],
        "development": persona["development"],
        "training": persona["training"],
    }
    return calculate_contribution(employee, WEIGHTS[department])


def _total_sales_with_addition(baseline_departments, target_department, count, persona_key):
    """
    target_department に count 名を追加した場合の全社売上（億円）を計算する。
    他の事業部は現状の配置（ベースライン）のまま変化しない前提の概算。
    """
    total = 0.0
    for department in DEPARTMENTS:
        base = baseline_departments[department]
        if department == target_department:
            added_ability = _persona_contribution(persona_key, department) * count
            new_count = base["count"] + count
            new_ability = base["ability"] + added_ability
            total += _department_sales(department, new_count, new_ability)
        else:
            total += base["sales"]
    return total


def _run_estimate(baseline_scenario, persona_key, target_sales):
    """
    1つの(ペルソナ, シナリオ)の組み合わせについて、
    人数1..MAX_COUNTを順に試し、最初に目標売上を超えた人数を求める。
    """
    mode = baseline_scenario["mode"]
    baseline_departments = baseline_scenario["departments"]
    baseline_total_cost = baseline_scenario["totalSales"] - baseline_scenario["totalProfit"]
    persona_cost = PERSONAS[persona_key]["cost"]  # 百万円

    fixed_target = FIXED_TARGET_DEPARTMENT.get(mode)

    attempts = []
    reached = False
    min_count = None
    last_total_sales = None
    last_total_profit = None

    for count in range(1, MAX_COUNT + 1):
        if fixed_target:
            total_sales = _total_sales_with_addition(
                baseline_departments, fixed_target, count, persona_key
            )
        else:
            # total_salesシナリオ: A/B/Cのうち全社売上が最大になる配属先を都度選ぶ
            total_sales = max(
                _total_sales_with_addition(baseline_departments, department, count, persona_key)
                for department in DEPARTMENTS
            )

        # コスト＝人件費×3（課題仕様）。既存100名分＋追加分の合計コストから利益を算出。
        added_cost = count * persona_cost * 3 / 100.0  # 百万円→億円換算込み
        total_profit = total_sales - (baseline_total_cost + added_cost)

        attempts.append({
            "count": count,
            "totalSales": total_sales,
            "totalProfit": total_profit,
        })

        last_total_sales = total_sales
        last_total_profit = total_profit

        if total_sales >= target_sales:
            reached = True
            min_count = count
            break

    gap = (target_sales - last_total_sales) if last_total_sales is not None else None

    return {
        "personaKey": persona_key,
        "scenarioId": baseline_scenario["id"],
        "reached": reached,
        "minCount": min_count,
        "totalSales": last_total_sales,
        "totalProfit": last_total_profit,
        "gap": gap,
        "attempts": attempts,
    }


def compute_adoption_threshold_table(baseline_scenarios, target_sales):
    """
    4ペルソナ x 4シナリオ = 16通りを、課題仕様の直接計算式のみで概算する。
    CP-SAT・optimize_dynamic_adoption()は一切使用せず、数秒未満で完了する。
    """
    baseline_by_id = {s["id"]: s for s in baseline_scenarios}

    results = []
    for persona_key in PERSONAS:
        for scenario in SCENARIOS:
            baseline_scenario = baseline_by_id.get(scenario["id"])
            if baseline_scenario is None:
                continue
            results.append(_run_estimate(baseline_scenario, persona_key, target_sales))

    personas = [
        {
            "key": key,
            "label": p["label"],
            "sales": p["sales"],
            "management": p["management"],
            "development": p["development"],
            "training": p["training"],
            "cost": p["cost"],
        }
        for key, p in PERSONAS.items()
    ]

    return {
        "personas": personas,
        "scenarios": SCENARIOS,
        "targetSales": target_sales,
        "maxCount": MAX_COUNT,
        "results": results,
        "isEstimate": True,
    }
