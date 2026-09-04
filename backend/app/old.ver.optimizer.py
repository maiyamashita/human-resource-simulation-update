//このファイルは現在使われておりません。

from ortools.sat.python import cp_model

from app.department_calculator import (
    DEPARTMENT_SETTINGS,
    BASE_SALES,
    GROWTH_RATE,
)


def optimize_a_contribution_with_sales_constraint(employees):
    """
    A事業部の貢献度を最大化する。

    制約:
    ・A事業部 30名以上
    ・B事業部 20名以上
    ・C事業部 10名以上
    ・全社員をA/B/Cのいずれかに配置
    ・全社売上 58億円以上
    """

    model = cp_model.CpModel()

    n = len(employees)

    # ==================================================
    # 1. 社員の配置変数
    # ==================================================

    assignment = {}

    for employee in employees:
        employee_id = employee["employee_id"]

        assignment[employee_id] = {
            "A": model.NewBoolVar(f"{employee_id}_A"),
            "B": model.NewBoolVar(f"{employee_id}_B"),
            "C": model.NewBoolVar(f"{employee_id}_C"),
        }

    # ==================================================
    # 2. 1人につき1事業部だけ
    # ==================================================

    for employee in employees:
        employee_id = employee["employee_id"]

        model.Add(
            assignment[employee_id]["A"]
            + assignment[employee_id]["B"]
            + assignment[employee_id]["C"]
            == 1
        )

    # ==================================================
    # 3. 各事業部の人数
    # ==================================================

    count = {}

    for department in ["A", "B", "C"]:
        count[department] = sum(
            assignment[e["employee_id"]][department]
            for e in employees
        )

    model.Add(count["A"] >= 30)
    model.Add(count["B"] >= 20)
    model.Add(count["C"] >= 10)

    # ==================================================
    # 4. 各事業部の能力値
    #
    # 貢献度は小数なので100倍して整数化
    #
    # 60.15 → 6015
    # ==================================================

    ability = {}

    for department in ["A", "B", "C"]:

        ability[department] = sum(
            int(round(
                employee["contributions"][department] * 100
            ))
            * assignment[employee["employee_id"]][department]
            for employee in employees
        )

    # ==================================================
    # 5. 人数ごとの補正係数を設定
    #
    # CP-SATでは「人数によって係数が変わる」
    # という部分をBool変数で表現する。
    # ==================================================

    penalty_selected = {}

    penalty_value = {}

    for department in ["A", "B", "C"]:

        minimum = DEPARTMENT_SETTINGS[department]["minimum_count"]

        penalty_selected[department] = {}
        penalty_value[department] = {}

        for employee_count in range(minimum, n + 1):

            selected = model.NewBoolVar(
                f"{department}_count_{employee_count}"
            )

            penalty_selected[department][employee_count] = selected

            # ------------------------------------------
            # 現在の department_calculator.py と同じ
            # ペナルティ計算
            # ------------------------------------------

            appropriate = DEPARTMENT_SETTINGS[department][
                "appropriate_count"
            ]

            fulfillment_rate = (
                employee_count / appropriate
            )

            rate = fulfillment_rate * 100

            # 不足ペナルティ
            if department == "A":
                if rate >= 100:
                    shortage = 1.00
                elif rate >= 90:
                    shortage = 0.85
                elif rate >= 80:
                    shortage = 0.70
                elif rate >= 70:
                    shortage = 0.50
                else:
                    shortage = 0.30

            elif department == "B":
                if rate >= 100:
                    shortage = 1.00
                elif rate >= 90:
                    shortage = 0.90
                elif rate >= 80:
                    shortage = 0.80
                elif rate >= 70:
                    shortage = 0.65
                else:
                    shortage = 0.50

            else:  # C
                if rate >= 100:
                    shortage = 1.00
                elif rate >= 90:
                    shortage = 0.95
                elif rate >= 80:
                    shortage = 0.90
                elif rate >= 70:
                    shortage = 0.80
                else:
                    shortage = 0.70

            # 過剰ペナルティ
            if rate <= 120:
                excess = 1.00
            elif rate <= 140:
                excess = 0.95
            elif rate <= 160:
                excess = 0.90
            else:
                excess = 0.80

            # department_calculator.py と同じルール
            if fulfillment_rate < 1:
                penalty = shortage
            else:
                penalty = excess

            penalty_value[department][employee_count] = int(
                round(penalty * 100)
            )

        # 実際の人数に対応する変数を1つだけON
        model.Add(
            sum(
                penalty_selected[department].values()
            ) == 1
        )

        # 実際の人数とBool変数を対応させる
        model.Add(
            count[department]
            ==
            sum(
                employee_count * penalty_selected[department][employee_count]
                for employee_count in penalty_selected[department]
            )
        )

    # ==================================================
    # 6. 基本売上
    #
    # department_calculator.py の
    #
    # base_sales * (
    #     1 + (ability_value / 100) * growth_rate
    # )
    #
    # と完全に同じ計算になるようにする。
    #
    # ability は100倍された整数。
    # 売上は1,000,000倍して整数化する。
    # ==================================================

    SALES_SCALE = 1_000_000

    basic_sales = {}

    for department in ["A", "B", "C"]:

        base = BASE_SALES[department]
        growth = GROWTH_RATE[department]

        coefficient = int(
            round(base * growth * 100)
        )

        basic_sales[department] = (
            base * SALES_SCALE
            + coefficient * ability[department]
        )

    # ==================================================
    # 7. ペナルティ適用後の売上
    # ==================================================

    final_sales = {}

    for department in ["A", "B", "C"]:

        parts = []

        for employee_count, selected in (
            penalty_selected[department].items()
        ):

            # 基本売上 × 人数選択Bool
            selected_basic_sales = model.NewIntVar(
                0,
                1_000_000_000,
                f"{department}_selected_sales_{employee_count}"
            )

            model.AddMultiplicationEquality(
                selected_basic_sales,
                [
                    basic_sales[department],
                    selected,
                ]
            )

            # ペナルティ適用
            adjusted_sales = model.NewIntVar(
                0,
                1_000_000_000,
                f"{department}_adjusted_sales_{employee_count}"
            )

            penalty = penalty_value[department][employee_count]

            model.Add(
                adjusted_sales * 100
                ==
                selected_basic_sales * penalty
            )

            parts.append(adjusted_sales)

        final_sales[department] = sum(parts)

    # ==================================================
    # 8. 全社売上
    # ==================================================

    total_sales = (
        final_sales["A"]
        + final_sales["B"]
        + final_sales["C"]
    )

    # ==================================================
    # 9. ★ 58億円制約
    #
    # SALES_SCALE = 1,000,000
    #
    # 58億円
    # → 58 × 1,000,000
    # ==================================================

    target_sales = 58 * SALES_SCALE

    model.Add(
        total_sales > target_sales
    )


    # ==================================================
    # 11. CP-SAT実行
    # ==================================================

    solver = cp_model.CpSolver()

    solver.parameters.max_time_in_seconds = 30

    status = solver.Solve(model)

    # ==================================================
    # 12. 結果
    # ==================================================

    if status not in (
        cp_model.OPTIMAL,
        cp_model.FEASIBLE,
    ):
        return None

    result = {
        "A": [],
        "B": [],
        "C": [],
    }

    for employee in employees:

        employee_id = employee["employee_id"]

        if solver.Value(
            assignment[employee_id]["A"]
        ):
            result["A"].append(employee_id)

        elif solver.Value(
            assignment[employee_id]["B"]
        ):
            result["B"].append(employee_id)

        elif solver.Value(
            assignment[employee_id]["C"]
        ):
            result["C"].append(employee_id)

    return result