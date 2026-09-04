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
            10**18,
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
            10**18,
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
                10**17,
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
    solver.parameters.max_time_in_seconds = 30.0

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
    # 13. 結果の構築
    # ==================================================
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