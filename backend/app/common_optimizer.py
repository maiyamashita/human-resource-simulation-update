#このファイル名はbackend/app/common_optimizer.pyです。

from ortools.sat.python import cp_model

from app.department_calculator import (
    DEPARTMENT_SETTINGS,
    BASE_SALES,
    GROWTH_RATE,
    calculate_shortage_penalty,
    calculate_excess_penalty,
)


DEPARTMENTS = ["A", "B", "C"]


# ==================================================
# 単位
# ==================================================

# 1億円 = 100,000,000円
YEN_PER_100_MILLION = 100_000_000

# 1百万円 = 1,000,000円
YEN_PER_MILLION = 1_000_000


# ==================================================
# 全社売上目標
# ==================================================

# 58億円
TARGET_SALES = 58 * YEN_PER_100_MILLION


# ==================================================
# 共通最適化モデル
# ==================================================

def build_common_model(employees):
    """
    A/B/C共通の最適化モデルを構築する。

    この関数ではシナリオ固有の目的関数は設定しない。

    共通モデルに含めるもの:
        ・社員配置
        ・最低人数制約
        ・事業部能力値
        ・人数による補正係数
        ・売上
        ・人件費
        ・利益
        ・全社売上58億円以上の制約
    """

    model = cp_model.CpModel()

    n = len(employees)

    # ==================================================
    # 1. 社員配置
    # ==================================================

    assignment = {}

    for employee in employees:

        employee_id = employee["employee_id"]

        assignment[employee_id] = {
            department: model.NewBoolVar(
                f"{employee_id}_{department}"
            )
            for department in DEPARTMENTS
        }

        # 1人につき1事業部だけ
        model.Add(
            sum(
                assignment[employee_id][department]
                for department in DEPARTMENTS
            )
            == 1
        )

    # ==================================================
    # 2. 各事業部の人数
    # ==================================================

    count = {}

    for department in DEPARTMENTS:

        count[department] = sum(
            assignment[
                employee["employee_id"]
            ][department]
            for employee in employees
        )

        minimum = DEPARTMENT_SETTINGS[
            department
        ]["minimum_count"]

        model.Add(
            count[department] >= minimum
        )

    # ==================================================
    # 3. 各事業部の能力値
    # ==================================================

    # 貢献度を100倍して整数化する。
    #
    # 例:
    # 60.15 → 6015
    #
    # 実際の能力値は100で割る。

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
                employee["employee_id"]
            ][department]
            for employee in employees
        )

    # ==================================================
    # 4. 人数別ペナルティ
    #
    # ペナルティは人数(充足率)の階段関数であり、
    # 実際に取り得る値は数種類しかない。
    # 人数ごとにBool変数を作る旧方式の代わりに、
    # count[department] - minimum を添字とした
    # 配列参照(AddElement)でペナルティ値を直接求める。
    #
    # penalty_value自体（{department: {employee_count: 値}}）は
    # 従来通りのPython定数表として維持する
    # （main.py等の既存利用箇所との互換のため）。
    # ==================================================

    penalty_index = {}
    penalty_var = {}
    penalty_value = {}

    for department in DEPARTMENTS:

        minimum = DEPARTMENT_SETTINGS[
            department
        ]["minimum_count"]

        appropriate = DEPARTMENT_SETTINGS[
            department
        ]["appropriate_count"]

        penalty_value[department] = {}

        for employee_count in range(
            minimum,
            n + 1
        ):

            # 充足率
            fulfillment_rate = (
                employee_count
                / appropriate
            )

            # ------------------------------------------
            # 不足ペナルティ
            #
            # 計算ルールは
            # department_calculator.py
            # を唯一の基準とする。
            # ------------------------------------------

            shortage_penalty = (
                calculate_shortage_penalty(
                    department,
                    fulfillment_rate,
                )
            )

            # ------------------------------------------
            # 過剰ペナルティ
            #
            # 計算ルールは
            # department_calculator.py
            # を唯一の基準とする。
            # ------------------------------------------

            excess_penalty = (
                calculate_excess_penalty(
                    fulfillment_rate
                )
            )

            # ------------------------------------------
            # 適用ペナルティ
            #
            # 100%未満:
            #     不足ペナルティ
            #
            # 100%以上:
            #     過剰ペナルティ
            # ------------------------------------------

            if fulfillment_rate < 1:
                penalty = shortage_penalty
            else:
                penalty = excess_penalty

            # CP-SAT用に100倍して整数化
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

        # ------------------------------------------
        # 基準売上
        #
        # 億円 → 円
        # ------------------------------------------

        base_sales_yen = int(
            round(
                BASE_SALES[department]
                * YEN_PER_100_MILLION
            )
        )

        # ------------------------------------------
        # 成長率
        #
        # GROWTH_RATE:
        #
        # A = 0.06
        # B = 0.12
        # C = 0.25
        #
        # ここで100倍して、
        #
        # A = 6
        # B = 12
        # C = 25
        #
        # とする。
        # ------------------------------------------

        growth_percent = int(
            round(
                GROWTH_RATE[department]
                * 100
            )
        )

        # ------------------------------------------
        # 成長分の分子
        #
        # 元の式:
        #
        # 基準売上
        # ×
        # (能力値 / 100)
        # ×
        # 成長率
        #
        # abilityは100倍整数、
        # growth_percentは成長率×100。
        #
        # よって、
        #
        # base_sales_yen
        # × ability
        # × growth_percent
        # ÷ 1,000,000
        #
        # となる。
        # ------------------------------------------

        growth_numerator = model.NewIntVar(
            0,
            10**18,
            f"{department}_growth_numerator",
        )

        model.Add(
            growth_numerator
            ==
            base_sales_yen
            * ability[department]
            * growth_percent
        )

        growth_sales = model.NewIntVar(
            0,
            10**18,
            f"{department}_growth_sales",
        )

        model.AddDivisionEquality(
            growth_sales,
            growth_numerator,
            1_000_000,
        )

        basic_sales[department] = (
            base_sales_yen
            + growth_sales
        )

    # ==================================================
    # 6. 最終売上
    # ==================================================

    final_sales = {}

    for department in DEPARTMENTS:

        # ------------------------------------------
        # 基本売上 × ペナルティ（AddElementで求めた値）
        #
        # penaltyは100倍整数のため、
        # 最後に100で割って戻す。
        # ------------------------------------------

        raw_sales = model.NewIntVar(
            0,
            10**17,
            f"{department}_raw_sales",
        )

        model.AddMultiplicationEquality(
            raw_sales,
            [
                basic_sales[department],
                penalty_var[department],
            ],
        )

        adjusted_sales = model.NewIntVar(
            0,
            10**15,
            f"{department}_adjusted_sales",
        )

        model.AddDivisionEquality(
            adjusted_sales,
            raw_sales,
            100,
        )

        final_sales[department] = adjusted_sales

    # ==================================================
    # 7. 全社売上
    # ==================================================

    total_sales = sum(
        final_sales[department]
        for department in DEPARTMENTS
    )

    # 58億円以上
    model.Add(
        total_sales >= TARGET_SALES + 1
    )

    # ==================================================
    # 8. 人件費
    # ==================================================

    # CSV:
    #
    # 人件費 = 百万円
    #
    # 事業部コスト:
    #
    # 社員の人件費合計 × 3
    #
    # 例:
    # 6.7百万円 × 3
    # = 20.1百万円
    #
    # 内部計算は円。

    personnel_cost = {}

    for department in DEPARTMENTS:

        personnel_cost[department] = sum(
            int(
                round(
                    employee["personnel_cost"]
                    * YEN_PER_MILLION
                    * 3
                )
            )
            * assignment[
                employee["employee_id"]
            ][department]
            for employee in employees
        )

    # ==================================================
    # 9. 事業部利益
    # ==================================================

    profit = {}

    for department in DEPARTMENTS:

        profit[department] = (
            final_sales[department]
            - personnel_cost[department]
        )

    # ==================================================
    # 10. 全社利益
    # ==================================================

    total_profit = sum(
        profit[department]
        for department in DEPARTMENTS
    )

    # ==================================================
    # 11. 共通モデルを返す
    # ==================================================

    return {
        "model": model,
        "assignment": assignment,
        "count": count,
        "ability": ability,
        "basic_sales": basic_sales,
        "final_sales": final_sales,
        "personnel_cost": personnel_cost,
        "profit": profit,
        "total_profit": total_profit,
        "total_sales": total_sales,
        "penalty_index": penalty_index,
        "penalty_var": penalty_var,
        "penalty_value": penalty_value,
    }


# ==================================================
# Solver
# ==================================================

def create_solver():

    solver = cp_model.CpSolver()

    # ★ 高速化設定
    # 1. タイムアウトを 3 秒に短縮（3秒以内でその時点の最良解を返す）
    solver.parameters.max_time_in_seconds = 3.0

    # 2. 再現性を優先し、シングルスレッド・固定シードを基本とする
    #    （AddElement化によりモデルが大幅に軽量化されたため、
    #     並列化なしでも3秒以内にOPTIMALへ到達できる）
    solver.parameters.num_search_workers = 1
    solver.parameters.random_seed = 42

    # 3. 許容誤差（MIP Gap）を 0.5% に設定（99.5%最適なら即時終了）
    solver.parameters.relative_gap_limit = 0.005

    return solver


# ==================================================
# 配置結果取得
# ==================================================

def get_assignment_result(
    employees,
    assignment,
    solver,
):

    result = {
        department: []
        for department in DEPARTMENTS
    }

    for employee in employees:

        employee_id = employee["employee_id"]

        for department in DEPARTMENTS:

            if solver.Value(
                assignment[
                    employee_id
                ][department]
            ):

                result[
                    department
                ].append(employee_id)

                break

    return result