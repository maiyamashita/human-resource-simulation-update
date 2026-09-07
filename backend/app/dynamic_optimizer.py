#このファイル名はbackend/app/dynamic_optimizer.pyです。

# ============================================================
# 本番最適化ロジック
# FastAPI の api/simulation.py から呼ばれる実際のOptimizer
# ============================================================

import math
import time
from ortools.sat.python import cp_model

from app.department_calculator import (
    DEPARTMENT_SETTINGS,
    BASE_SALES,
    GROWTH_RATE,
    calculate_shortage_penalty,
    calculate_excess_penalty,
)

DEPARTMENTS = ["A", "B", "C"]

YEN_PER_100_MILLION = 100_000_000
YEN_PER_MILLION = 1_000_000


def _calculate_max_bounds_for_dynamic_model(
    employees,
    min_counts,
):
    """
    社員データから、各変数の実際の最大値を計算する。
    これにより、NewIntVar の上限値を適切に設定できる。
    """
    max_growth_numerator = {}
    max_growth_sales = {}
    max_raw_sales = {}

    n = len(employees)

    for department in DEPARTMENTS:
        # 貢献度を100倍した値を取得
        contributions_scaled = [
            int(round(emp["contributions"][department] * 100))
            for emp in employees
        ]

        # 他事業部の最低人数を確保した場合に、
        # この事業部へ配置可能な最大人数を計算
        max_assignable_count = n - sum(
            min_counts[d]
            for d in DEPARTMENTS
            if d != department
        )

        # 配置可能な最大人数分の貢献度を上限とする
        contributions_scaled.sort(reverse=True)

        max_ability = sum(
            contributions_scaled[:max_assignable_count]
        )

        # 基準売上（円）と成長率を計算
        base_sales_yen = int(
            round(
                BASE_SALES[department]
                * YEN_PER_100_MILLION
            )
        )

        growth_percent = int(
            round(
                GROWTH_RATE[department]
                * 100
            )
        )

        # growth_numerator の最大値
        max_growth_numerator[department] = (
            base_sales_yen
            * max_ability
            * growth_percent
        )

        # growth_sales の最大値
        max_growth_sales[department] = (
            max_growth_numerator[department]
            // 1_000_000
        )

        # raw_sales の最大値
        # = (base_sales + growth_sales) × penalty
        # penalty は 0-100 の範囲だが、最大100を想定
        max_basic_sales = (
            base_sales_yen
            + max_growth_sales[department]
        )

        max_raw_sales[department] = (
            max_basic_sales * 100
        )

    return (
        max_growth_numerator,
        max_growth_sales,
        max_raw_sales,
    )


def calculate_dynamic_settings(total_employees: int):
    """
    全社員数 N 名に応じた適正人数と最低人数を動的に計算する。
    """
    ratios = {'A': 0.40, 'B': 0.35, 'C': 0.25}
    raw = {d: total_employees * ratios[d] for d in DEPARTMENTS}
    int_counts = {d: math.floor(raw[d]) for d in DEPARTMENTS}
    remainders = {d: raw[d] - int_counts[d] for d in DEPARTMENTS}

    shortage = total_employees - sum(int_counts.values())
    sorted_depts = sorted(remainders.keys(), key=lambda d: remainders[d], reverse=True)

    appropriate_counts = int_counts.copy()
    for i in range(shortage):
        appropriate_counts[sorted_depts[i]] += 1

    min_rates = {
        'A': 30.0 / 40.0,
        'B': 20.0 / 35.0,
        'C': 10.0 / 25.0
    }

    minimum_counts = {
        d: max(1, int(math.floor(appropriate_counts[d] * min_rates[d])))
        for d in DEPARTMENTS
    }

    return appropriate_counts, minimum_counts

def optimize_dynamic_adoption(
    employees,
    target_sales_billion=58,
    mode="total_sales",
    use_penalty=True,
):
    start_total = time.perf_counter()

    sorted_employees = sorted(
        employees,
        key=lambda x: str(
            x.get("employee_id") or x.get("id") or ""
        )
    )

    model = cp_model.CpModel()
    n = len(sorted_employees)

    # ==================================================
    # 動的に適正人数・最低人数を算出
    # ==================================================
    app_counts, min_counts = calculate_dynamic_settings(n)

    # ==================================================
    # 最大値を計算（変数上限の最適化）
    # ==================================================
    max_growth_numerator, max_growth_sales, max_raw_sales = (
        _calculate_max_bounds_for_dynamic_model(
            sorted_employees,
            min_counts,
        )
    )

    # ==================================================
    # 1. 社員配置
    # ==================================================
    assignment = {}

    for employee in sorted_employees:
        employee_id = str(employee["employee_id"])

        assignment[employee_id] = {
            department: model.NewBoolVar(
                f"{employee_id}_{department}"
            )
            for department in DEPARTMENTS
        }

        model.Add(
            sum(
                assignment[employee_id][department]
                for department in DEPARTMENTS
            ) == 1
        )

    # ==================================================
    # 2. 各事業部の人数と動的最低人数制約
    # ==================================================
    count = {}

    for department in DEPARTMENTS:
        count[department] = sum(
            assignment[
                str(employee["employee_id"])
            ][department]
            for employee in sorted_employees
        )

        model.Add(
            count[department]
            >= min_counts[department]
        )

    # ==================================================
    # 3. 各事業部の能力値
    # ==================================================
    ability = {}

    for department in DEPARTMENTS:
        ability[department] = sum(
            int(
                round(
                    employee["contributions"][department]
                    * 100
                )
            )
            * assignment[
                str(employee["employee_id"])
            ][department]
            for employee in sorted_employees
        )


    # ==================================================
    # 4. 人数別ペナルティ
    #
    # ペナルティは人数(充足率)の階段関数であり、
    # 実際に取り得る値は数種類しかない。
    # 人数ごとにBool変数を作る旧方式の代わりに、
    # count[department] - minimum を添字とした
    # 配列参照(AddElement)でペナルティ値を直接求める。
    # ==================================================
    penalty_index = {}
    penalty_var = {}
    penalty_value = {}

    if use_penalty:

        for department in DEPARTMENTS:

            minimum = min_counts[department]
            appropriate = app_counts[department]

            penalty_value[department] = {}

            for employee_count in range(
                minimum,
                n + 1
            ):

                fulfillment_rate = (
                    employee_count
                    / appropriate
                )

                shortage_penalty = (
                    calculate_shortage_penalty(
                        department,
                        fulfillment_rate
                    )
                )

                excess_penalty = (
                    calculate_excess_penalty(
                        fulfillment_rate
                    )
                )

                if fulfillment_rate < 1:
                    penalty = shortage_penalty
                else:
                    penalty = excess_penalty

                penalty_value[
                    department
                ][employee_count] = int(
                    round(penalty * 100)
                )

            # ------------------------------------------
            # count[department] - minimum を添字として
            # ペナルティ値を配列参照する。
            # ------------------------------------------

            index = model.NewIntVar(
                0,
                n - minimum,
                f"{department}_penalty_index",
            )

            model.Add(
                index == count[department] - minimum
            )

            values_table = [
                penalty_value[department][employee_count]
                for employee_count in range(minimum, n + 1)
            ]

            value = model.NewIntVar(
                min(values_table),
                max(values_table),
                f"{department}_penalty_value_var",
            )

            model.AddElement(
                index,
                values_table,
                value,
            )

            penalty_index[department] = index
            penalty_var[department] = value



    # ==================================================
    # 5. 基本売上
    # ==================================================
    basic_sales = {}

    for department in DEPARTMENTS:

        base_sales_yen = int(
            round(
                BASE_SALES[department]
                * YEN_PER_100_MILLION
            )
        )

        growth_percent = int(
            round(
                GROWTH_RATE[department]
                * 100
            )
        )

        growth_numerator = model.NewIntVar(
            0,
            max_growth_numerator[department],
            f"{department}_growth_numerator"
        )

        model.Add(
            growth_numerator
            == (
                base_sales_yen
                * ability[department]
                * growth_percent
            )
        )

        growth_sales = model.NewIntVar(
            0,
            max_growth_sales[department],
            f"{department}_growth_sales"
        )

        model.AddDivisionEquality(
            growth_sales,
            growth_numerator,
            1_000_000
        )

        basic_sales[department] = (
            base_sales_yen
            + growth_sales
        )



    # ==================================================
    # 6. 最終売上
    # ==================================================
    final_sales = {}

    if use_penalty:

        # ------------------------------------------
        # 基本売上 × ペナルティ（AddElementで求めた値）
        #
        # penaltyは100倍整数のため、
        # 最後に100で割って戻す。
        # ------------------------------------------
        for department in DEPARTMENTS:

            raw_sales = model.NewIntVar(
                0,
                max_raw_sales[department],
                f"{department}_raw_sales"
            )

            model.AddMultiplicationEquality(
                raw_sales,
                [
                    basic_sales[department],
                    penalty_var[department]
                ]
            )

            adjusted_sales = model.NewIntVar(
                0,
                10**15,
                f"{department}_adjusted_sales"
            )

            model.AddDivisionEquality(
                adjusted_sales,
                raw_sales,
                100
            )

            final_sales[department] = adjusted_sales

    else:

        for department in DEPARTMENTS:
            final_sales[department] = basic_sales[department]
    
    # ==================================================
    # 7. 全社売上
    # ==================================================
    total_sales = sum(
        final_sales[department]
        for department in DEPARTMENTS
    )

    # ==================================================
    # 8. 全社売上目標制約
    # ==================================================
    target_sales_yen = int(
        target_sales_billion
        * YEN_PER_100_MILLION
    )

    model.Add(
        total_sales
        >= target_sales_yen + 1
    )

    # ==================================================
    # 9. 人件費
    # ==================================================
    personnel_cost = {}

    for department in DEPARTMENTS:

        dept_cost_list = []

        for employee in sorted_employees:

            raw_cost = employee.get(
                "personnel_cost",
                employee.get("cost", 0)
            )

            cost_yen = int(
                round(
                    float(raw_cost)
                    * YEN_PER_MILLION
                    * 3
                )
            )

            dept_cost_list.append(
                cost_yen
                * assignment[
                    str(employee["employee_id"])
                ][department]
            )

        personnel_cost[department] = sum(
            dept_cost_list
        )

    # ==================================================
    # 10. 事業部利益・全社利益
    # ==================================================
    profit = {}

    for department in DEPARTMENTS:
        profit[department] = (
            final_sales[department]
            - personnel_cost[department]
        )

    total_profit = sum(
        profit[department]
        for department in DEPARTMENTS
    )

    # ==================================================
    # 11. 目的関数
    # ==================================================
    if mode == "a_profit":

        model.Maximize(
            profit["A"]
        )

    elif mode == "b_sales":

        model.Maximize(
            final_sales["B"]
        )

    elif mode == "c_sales":

        model.Maximize(
            final_sales["C"]
        )

    else:

        model.Maximize(
            total_sales
        )

    # ==================================================
    # 12. Solver実行
    # ==================================================
    solver = cp_model.CpSolver()

    solver.parameters.random_seed = 42
    solver.parameters.num_search_workers = 1
    # タイムアウトを 15 秒に設定
    # （ローカル環境では数秒で終了、Render等の制限環境でも OPTIMAL/FEASIBLE に到達できるよう余裕を持たせた）
    solver.parameters.max_time_in_seconds = 15

    solver_start = time.perf_counter()

    print(
        f"[DynamicOptimizer MODEL] "
        f"employees={n}, "
        f"mode={mode}, "
        f"use_penalty={use_penalty}, "
        f"variables={len(model.proto.variables)}, "
        f"constraints={len(model.proto.constraints)}"
    )

    status = solver.Solve(model)

    solver_time = (
        time.perf_counter()
        - solver_start
    )

    print(
        f"[DynamicOptimizer] "
        f"employees={n}, "
        f"mode={mode}, "
        f"use_penalty={use_penalty}, "
        f"status={solver.StatusName(status)}, "
        f"solver={solver_time:.3f}s, "
        f"wall_time={solver.WallTime():.3f}s, "
        f"branches={solver.NumBranches()}, "
        f"conflicts={solver.NumConflicts()}"
    )

    if status not in (
        cp_model.OPTIMAL,
        cp_model.FEASIBLE
    ):

        print(
            f"[DynamicOptimizer] "
            f"FAILED: employees={n}, "
            f"mode={mode}"
        )

        return None

    # ==================================================
    # 13. 結果の構築（solver.Value() 呼び出しで例外が発生しないよう try-catch で保護）
    # ==================================================
    try:
        assignment_res = {
            department: []
            for department in DEPARTMENTS
        }

        for employee in sorted_employees:

            employee_id = str(
                employee["employee_id"]
            )

            for department in DEPARTMENTS:

                if solver.Value(
                    assignment[
                        employee_id
                    ][department]
                ):

                    assignment_res[
                        department
                    ].append(employee_id)

                    break

        return {
            "assignment": assignment_res,

            "total_sales": solver.Value(
                total_sales
            ),

            "total_profit": solver.Value(
                total_profit
            ),

            "sales": {
                d: solver.Value(
                    final_sales[d]
                )
                for d in DEPARTMENTS
            },

            "profit": {
                d: solver.Value(
                    profit[d]
                )
                for d in DEPARTMENTS
            },

            "a_profit": solver.Value(
                profit["A"]
            ),

            "b_sales": solver.Value(
                final_sales["B"]
            ),

            "c_sales": solver.Value(
                final_sales["C"]
            ),

            "count": {
                d: solver.Value(
                    count[d]
                )
                for d in DEPARTMENTS
            },

            "ability": {
                d: solver.Value(
                    ability[d]
                )
                for d in DEPARTMENTS
            },

            "dynamic_settings": {
                "appropriate_counts": app_counts,
                "minimum_counts": min_counts
            }
        }

    except Exception as e:
        print(
            f"[DynamicOptimizer] "
            f"Failed to extract solver values: {e}"
        )
        return None

# ============================================================
# 100名固定モード用追加採用Optimizer
#
# 既存100名の配置を固定し、
# 追加採用者のみをCP-SATで最適配置する。
# ============================================================

def optimize_fixed_adoption(
    employees,
    fixed_assignment,
    target_sales_billion=58,
    mode="total_sales",
    use_penalty=True,
):
    """
    100名固定モード用の追加採用最適化。

    既存100名の配置は fixed_assignment で固定し、
    fixed_assignment に含まれない追加採用者だけを
    CP-SATで最適配置する。

    fixed_assignment:
        {
            "A": ["既存社員ID", ...],
            "B": ["既存社員ID", ...],
            "C": ["既存社員ID", ...]
        }

    mode:
        "total_sales"
        "a_profit"
        "b_sales"
        "c_sales"
    """

    start_total = time.perf_counter()

    # ==================================================
    # 1. 社員をID順に並べる
    # ==================================================
    sorted_employees = sorted(
        employees,
        key=lambda x: str(
            x.get("employee_id") or x.get("id") or ""
        )
    )

    n = len(sorted_employees)

    # ==================================================
    # 2. 全社員IDを取得
    # ==================================================
    all_employee_ids = {
        str(
            employee.get("employee_id")
            or employee.get("id")
            or ""
        )
        for employee in sorted_employees
    }

    # ==================================================
    # 3. 固定配置を正規化
    # ==================================================
    normalized_fixed_assignment = {
        department: [
            str(employee_id)
            for employee_id in fixed_assignment.get(
                department, []
            )
        ]
        for department in DEPARTMENTS
    }

    # ==================================================
    # 4. 固定社員IDを取得
    # ==================================================
    fixed_ids = set()

    for department in DEPARTMENTS:

        for employee_id in normalized_fixed_assignment[
            department
        ]:

            # ------------------------------------------
            # 存在しない社員IDが固定配置に含まれていないか確認
            # ------------------------------------------
            if employee_id not in all_employee_ids:

                print(
                    "[FixedAdoptionOptimizer] "
                    f"固定配置に存在しない社員IDがあります: "
                    f"{employee_id}"
                )

                return None

            # ------------------------------------------
            # 同じ社員が複数事業部に配置されていないか確認
            # ------------------------------------------
            if employee_id in fixed_ids:

                print(
                    "[FixedAdoptionOptimizer] "
                    f"社員 {employee_id} が複数事業部に"
                    "固定配置されています。"
                )

                return None

            fixed_ids.add(employee_id)

    # ==================================================
    # 5. 100名固定であることを確認
    # ==================================================
    if len(fixed_ids) != 100:

        print(
            "[FixedAdoptionOptimizer] "
            f"固定社員数が100名ではありません: "
            f"{len(fixed_ids)}名"
        )

        return None

    # ==================================================
    # 6. 追加採用者を特定
    #
    # 固定100名に含まれていない社員が
    # 追加採用者となる。
    # ==================================================
    new_employees = [
        employee
        for employee in sorted_employees
        if str(
            employee.get("employee_id")
            or employee.get("id")
            or ""
        ) not in fixed_ids
    ]

    if not new_employees:

        print(
            "[FixedAdoptionOptimizer] "
            "追加採用者が存在しません。"
        )

        return None

    # ==================================================
    # 7. 固定社員の所属事業部を作成
    # ==================================================
    fixed_department_by_employee = {}

    for department in DEPARTMENTS:

        for employee_id in normalized_fixed_assignment[
            department
        ]:

            fixed_department_by_employee[
                employee_id
            ] = department

    # ==================================================
    # 8. 全社員数に応じた動的人員設定
    #
    # 100名固定であっても、
    # 追加採用後の総人数に対する適正人数・最低人数
    # を使用する。
    # ==================================================
    app_counts, min_counts = calculate_dynamic_settings(n)

    # ==================================================
    # 9. CP-SATモデル
    # ==================================================
    model = cp_model.CpModel()

    # ==================================================
    # 10. 追加採用者だけ配置変数を作成
    # ==================================================
    assignment = {}

    for employee in new_employees:

        employee_id = str(
            employee["employee_id"]
        )

        assignment[employee_id] = {
            department: model.NewBoolVar(
                f"fixed_{employee_id}_{department}"
            )
            for department in DEPARTMENTS
        }

        # ------------------------------------------
        # 追加採用者はA/B/Cのいずれか1つに配置
        # ------------------------------------------
        model.Add(
            sum(
                assignment[employee_id][department]
                for department in DEPARTMENTS
            ) == 1
        )

    # ==================================================
    # 11. 各事業部の人数
    #
    # 固定100名 + 追加採用者
    # ==================================================
    count = {}

    fixed_count = {
        department: len(
            normalized_fixed_assignment[department]
        )
        for department in DEPARTMENTS
    }

    for department in DEPARTMENTS:

        new_count = sum(
            assignment[
                str(employee["employee_id"])
            ][department]
            for employee in new_employees
        )

        count[department] = (
            fixed_count[department]
            + new_count
        )

        # ------------------------------------------
        # 追加採用後の最低人数を満たす
        # ------------------------------------------
        model.Add(
            count[department]
            >= min_counts[department]
        )

    # ==================================================
    # 12. 各事業部の能力値
    #
    # 固定100名の能力 + 追加採用者の能力
    # ==================================================
    ability = {}

    fixed_ability = {}

    for department in DEPARTMENTS:

        fixed_ability[department] = sum(
            int(
                round(
                    employee["contributions"][department]
                    * 100
                )
            )
            for employee in sorted_employees
            if fixed_department_by_employee.get(
                str(employee["employee_id"])
            ) == department
        )

    for department in DEPARTMENTS:

        new_ability = sum(
            int(
                round(
                    employee["contributions"][department]
                    * 100
                )
            )
            * assignment[
                str(employee["employee_id"])
            ][department]
            for employee in new_employees
        )

        ability[department] = (
            fixed_ability[department]
            + new_ability
        )

    # ==================================================
    # 13. 売上計算用の最大値
    #
    # 固定社員の能力 +
    # 追加採用者がその事業部に全員入った場合の
    # 最大能力を上限として使用する。
    # ==================================================
    max_growth_numerator = {}
    max_growth_sales = {}
    max_raw_sales = {}

    for department in DEPARTMENTS:

        # ------------------------------------------
        # 追加採用者のうち、
        # この事業部への貢献度が正のものをすべて加算
        # して安全な上限値を作る。
        # ------------------------------------------
        max_new_ability = sum(
            max(
                0,
                int(
                    round(
                        employee["contributions"][department]
                        * 100
                    )
                )
            )
            for employee in new_employees
        )

        max_ability = (
            fixed_ability[department]
            + max_new_ability
        )

        base_sales_yen = int(
            round(
                BASE_SALES[department]
                * YEN_PER_100_MILLION
            )
        )

        growth_percent = int(
            round(
                GROWTH_RATE[department]
                * 100
            )
        )

        max_growth_numerator[department] = (
            base_sales_yen
            * max_ability
            * growth_percent
        )

        max_growth_sales[department] = (
            max_growth_numerator[department]
            // 1_000_000
        )

        max_basic_sales = (
            base_sales_yen
            + max_growth_sales[department]
        )

        max_raw_sales[department] = (
            max_basic_sales
            * 100
        )

    # ==================================================
    # 14. 人数別ペナルティ
    # ==================================================
    penalty_index = {}
    penalty_var = {}
    penalty_value = {}

    if use_penalty:

        for department in DEPARTMENTS:

            minimum = min_counts[department]
            appropriate = app_counts[department]

            penalty_value[department] = {}

            for employee_count in range(
                minimum,
                n + 1
            ):

                fulfillment_rate = (
                    employee_count
                    / appropriate
                )

                shortage_penalty = (
                    calculate_shortage_penalty(
                        department,
                        fulfillment_rate
                    )
                )

                excess_penalty = (
                    calculate_excess_penalty(
                        fulfillment_rate
                    )
                )

                if fulfillment_rate < 1:
                    penalty = shortage_penalty
                else:
                    penalty = excess_penalty

                penalty_value[
                    department
                ][employee_count] = int(
                    round(
                        penalty * 100
                    )
                )

            # ------------------------------------------
            # count - minimum を添字として使用
            # ------------------------------------------
            index = model.NewIntVar(
                0,
                n - minimum,
                f"fixed_{department}_penalty_index",
            )

            model.Add(
                index
                == count[department] - minimum
            )

            values_table = [
                penalty_value[
                    department
                ][employee_count]
                for employee_count
                in range(
                    minimum,
                    n + 1
                )
            ]

            value = model.NewIntVar(
                min(values_table),
                max(values_table),
                f"fixed_{department}_penalty_value_var",
            )

            model.AddElement(
                index,
                values_table,
                value,
            )

            penalty_index[department] = index
            penalty_var[department] = value

    # ==================================================
    # 15. 基本売上
    # ==================================================
    basic_sales = {}

    for department in DEPARTMENTS:

        base_sales_yen = int(
            round(
                BASE_SALES[department]
                * YEN_PER_100_MILLION
            )
        )

        growth_percent = int(
            round(
                GROWTH_RATE[department]
                * 100
            )
        )

        growth_numerator = model.NewIntVar(
            0,
            max_growth_numerator[department],
            f"fixed_{department}_growth_numerator"
        )

        model.Add(
            growth_numerator
            == (
                base_sales_yen
                * ability[department]
                * growth_percent
            )
        )

        growth_sales = model.NewIntVar(
            0,
            max_growth_sales[department],
            f"fixed_{department}_growth_sales"
        )

        model.AddDivisionEquality(
            growth_sales,
            growth_numerator,
            1_000_000
        )

        basic_sales[department] = (
            base_sales_yen
            + growth_sales
        )

    # ==================================================
    # 16. 最終売上
    # ==================================================
    final_sales = {}

    if use_penalty:

        for department in DEPARTMENTS:

            raw_sales = model.NewIntVar(
                0,
                max_raw_sales[department],
                f"fixed_{department}_raw_sales"
            )

            model.AddMultiplicationEquality(
                raw_sales,
                [
                    basic_sales[department],
                    penalty_var[department]
                ]
            )

            adjusted_sales = model.NewIntVar(
                0,
                10**15,
                f"fixed_{department}_adjusted_sales"
            )

            model.AddDivisionEquality(
                adjusted_sales,
                raw_sales,
                100
            )

            final_sales[department] = (
                adjusted_sales
            )

    else:

        for department in DEPARTMENTS:

            final_sales[department] = (
                basic_sales[department]
            )

    # ==================================================
    # 17. 全社売上
    # ==================================================
    total_sales = sum(
        final_sales[department]
        for department in DEPARTMENTS
    )

    # ==================================================
    # 18. 全社売上目標制約
    # ==================================================
    target_sales_yen = int(
        target_sales_billion
        * YEN_PER_100_MILLION
    )

    model.Add(
        total_sales
        >= target_sales_yen + 1
    )

    # ==================================================
    # 19. 人件費
    #
    # 固定100名 + 追加採用者
    # ==================================================
    personnel_cost = {}

    for department in DEPARTMENTS:

        # ------------------------------------------
        # 固定100名の人件費
        # ------------------------------------------
        fixed_cost = sum(
            int(
                round(
                    float(
                        employee.get(
                            "personnel_cost",
                            employee.get("cost", 0)
                        )
                    )
                    * YEN_PER_MILLION
                    * 3
                )
            )
            for employee in sorted_employees
            if fixed_department_by_employee.get(
                str(employee["employee_id"])
            ) == department
        )

        # ------------------------------------------
        # 追加採用者の人件費
        # ------------------------------------------
        new_cost = sum(
            int(
                round(
                    float(
                        employee.get(
                            "personnel_cost",
                            employee.get("cost", 0)
                        )
                    )
                    * YEN_PER_MILLION
                    * 3
                )
            )
            * assignment[
                str(employee["employee_id"])
            ][department]
            for employee in new_employees
        )

        personnel_cost[department] = (
            fixed_cost
            + new_cost
        )

    # ==================================================
    # 20. 事業部利益・全社利益
    # ==================================================
    profit = {}

    for department in DEPARTMENTS:

        profit[department] = (
            final_sales[department]
            - personnel_cost[department]
        )

    total_profit = sum(
        profit[department]
        for department in DEPARTMENTS
    )

    # ==================================================
    # 21. 目的関数
    # ==================================================
    if mode == "a_profit":

        model.Maximize(
            profit["A"]
        )

    elif mode == "b_sales":

        model.Maximize(
            final_sales["B"]
        )

    elif mode == "c_sales":

        model.Maximize(
            final_sales["C"]
        )

    else:

        model.Maximize(
            total_sales
        )

    # ==================================================
    # 22. Solver実行
    # ==================================================
    solver = cp_model.CpSolver()

    solver.parameters.random_seed = 42
    solver.parameters.num_search_workers = 1
    solver.parameters.max_time_in_seconds = 15

    solver_start = time.perf_counter()

    print(
        f"[FixedAdoptionOptimizer MODEL] "
        f"employees={n}, "
        f"fixed={len(fixed_ids)}, "
        f"new={len(new_employees)}, "
        f"mode={mode}, "
        f"use_penalty={use_penalty}, "
        f"variables={len(model.proto.variables)}, "
        f"constraints={len(model.proto.constraints)}"
    )

    status = solver.Solve(model)

    solver_time = (
        time.perf_counter()
        - solver_start
    )

    print(
        f"[FixedAdoptionOptimizer] "
        f"employees={n}, "
        f"fixed={len(fixed_ids)}, "
        f"new={len(new_employees)}, "
        f"mode={mode}, "
        f"use_penalty={use_penalty}, "
        f"status={solver.StatusName(status)}, "
        f"solver={solver_time:.3f}s, "
        f"wall_time={solver.WallTime():.3f}s, "
        f"branches={solver.NumBranches()}, "
        f"conflicts={solver.NumConflicts()}"
    )

    if status not in (
        cp_model.OPTIMAL,
        cp_model.FEASIBLE
    ):

        print(
            f"[FixedAdoptionOptimizer] "
            f"FAILED: employees={n}, "
            f"fixed={len(fixed_ids)}, "
            f"new={len(new_employees)}, "
            f"mode={mode}"
        )

        return None

    # ==================================================
    # 23. 結果構築
    # ==================================================
    try:

        assignment_res = {
            department: []
            for department in DEPARTMENTS
        }

        # ------------------------------------------
        # まず固定100名をそのまま配置
        # ------------------------------------------
        for department in DEPARTMENTS:

            assignment_res[department] = [
                str(employee_id)
                for employee_id
                in normalized_fixed_assignment[
                    department
                ]
            ]

        # ------------------------------------------
        # 次に追加採用者の最適配置を追加
        # ------------------------------------------
        for employee in new_employees:

            employee_id = str(
                employee["employee_id"]
            )

            for department in DEPARTMENTS:

                if solver.Value(
                    assignment[
                        employee_id
                    ][department]
                ):

                    assignment_res[
                        department
                    ].append(employee_id)

                    break

        return {
            "assignment": assignment_res,

            "total_sales": solver.Value(
                total_sales
            ),

            "total_profit": solver.Value(
                total_profit
            ),

            "sales": {
                department: solver.Value(
                    final_sales[department]
                )
                for department in DEPARTMENTS
            },

            "profit": {
                department: solver.Value(
                    profit[department]
                )
                for department in DEPARTMENTS
            },

            "a_profit": solver.Value(
                profit["A"]
            ),

            "b_sales": solver.Value(
                final_sales["B"]
            ),

            "c_sales": solver.Value(
                final_sales["C"]
            ),

            "count": {
                department: solver.Value(
                    count[department]
                )
                for department in DEPARTMENTS
            },

            "ability": {
                department: solver.Value(
                    ability[department]
                )
                for department in DEPARTMENTS
            },

            "dynamic_settings": {
                "appropriate_counts": app_counts,
                "minimum_counts": min_counts
            }
        }

    except Exception as e:

        print(
            f"[FixedAdoptionOptimizer] "
            f"Failed to extract solver values: {e}"
        )

        return None

    
    