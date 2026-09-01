#このファイル名はmain.pyですが、共通部分に特化しています。注意！

from ortools.sat.python import cp_model

from app.csv_loader import load_employees
from app.contribution import (
    calculate_all_contributions,
)
from app.common_optimizer import (
    build_common_model,
    create_solver,
    get_assignment_result,
)
from app.department_calculator import (
    DEPARTMENT_SETTINGS,
)


CSV_FILE = "human_resources_100.csv"

DEPARTMENTS = ["A", "B", "C"]

# ==================================================
# 円 → 億円
# ==================================================

YEN_PER_100_MILLION = 100_000_000

# 能力値は100倍されている
ABILITY_SCALE = 100


def yen_to_oku(yen):
    """
    円を億円に変換する。
    """

    return yen / YEN_PER_100_MILLION


def ability_to_float(ability):
    """
    CP-SAT内部の100倍整数能力値を
    通常の能力値に戻す。
    """

    return ability / ABILITY_SCALE


def main():

    # ==================================================
    # 1. CSV読み込み
    # ==================================================

    employees = load_employees(
        CSV_FILE
    )

    print(
        "社員データを読み込みました。"
    )

    print(
        f"社員数: {len(employees)}名"
    )

    # ==================================================
    # 2. 貢献度計算
    # ==================================================

    for employee in employees:

        employee["contributions"] = (
            calculate_all_contributions(
                employee
            )
        )

    # ==================================================
    # 3. 共通モデル構築
    # ==================================================

    model_data = build_common_model(
        employees
    )

    model = model_data["model"]

    # ==================================================
    # 4. 共通モデルを実行
    # ==================================================
    #
    # ここでは目的関数を設定しない。
    #
    # シナリオ固有の
    # ・売上最大化
    # ・利益最大化
    # ・A能力最大化
    #
    # などはここでは行わない。
    #
    # 共通制約を満たす実行可能解を取得する。
    # ==================================================

    solver = create_solver()

    status = solver.Solve(
        model
    )

    print(
        f"\nSolver Status: "
        f"{solver.StatusName(status)}"
    )

    if status not in (
        cp_model.OPTIMAL,
        cp_model.FEASIBLE,
    ):

        print(
            "\n共通モデルの条件を満たす配置が"
            "見つかりませんでした。"
        )

        return

    # ==================================================
    # 5. 配置結果
    # ==================================================

    assignment = get_assignment_result(
        employees,
        model_data["assignment"],
        solver,
    )

    print(
        "\n=== 共通モデル確認 ==="
    )

    print(
        "\n--- 配置 ---"
    )

    for department in DEPARTMENTS:

        print(
            f"{department}事業部: "
            f"{len(assignment[department])}名"
        )

    # ==================================================
    # 6. 事業部ごとの結果
    # ==================================================

    print(
        "\n--- 事業部計算結果 ---"
    )

    for department in DEPARTMENTS:

        count = solver.Value(
            model_data["count"][
                department
            ]
        )

        ability = solver.Value(
            model_data["ability"][
                department
            ]
        )

        basic_sales = solver.Value(
            model_data["basic_sales"][
                department
            ]
        )

        final_sales = solver.Value(
            model_data["final_sales"][
                department
            ]
        )

        personnel_cost = solver.Value(
            model_data["personnel_cost"][
                department
            ]
        )

        profit = solver.Value(
            model_data["profit"][
                department
            ]
        )

        # ------------------------------------------
        # 補正係数
        # ------------------------------------------

        penalty = (
            model_data["penalty_value"][
                department
            ][count]
            / 100
        )

        # ------------------------------------------
        # 充足率
        # ------------------------------------------

        appropriate_count = (
            DEPARTMENT_SETTINGS[
                department
            ]["appropriate_count"]
        )

        fulfillment_rate = (
            count
            / appropriate_count
        )

        # ------------------------------------------
        # 出力
        # ------------------------------------------

        print(
            f"\n{DEPARTMENT_SETTINGS[department]['name']}"
        )

        print(
            f"配置人数: "
            f"{count}名"
        )

        print(
            f"事業部能力値: "
            f"{ability_to_float(ability):.2f}"
        )

        print(
            f"充足率: "
            f"{fulfillment_rate * 100:.1f}%"
        )

        print(
            f"適用補正係数: "
            f"{penalty:.2f}"
        )

        print(
            f"基本売上: "
            f"{yen_to_oku(basic_sales):.6f}億円"
        )

        print(
            f"最終売上: "
            f"{yen_to_oku(final_sales):.6f}億円"
        )

        print(
            f"人件費: "
            f"{yen_to_oku(personnel_cost):.6f}億円"
        )

        print(
            f"利益: "
            f"{yen_to_oku(profit):.6f}億円"
        )

    # ==================================================
    # 7. 全社結果
    # ==================================================

    total_sales = solver.Value(
        model_data["total_sales"]
    )

    total_profit = solver.Value(
        model_data["total_profit"]
    )

    print(
        "\n--- 全社結果 ---"
    )

    print(
        f"全社売上: "
        f"{yen_to_oku(total_sales):.6f}億円"
    )

    sales_difference = (
        total_sales
        - 58 * YEN_PER_100_MILLION
    )

    print(
        f"58億円との差: "
        f"{yen_to_oku(sales_difference):+.6f}億円"
    )

    print(
        f"全社利益: "
        f"{yen_to_oku(total_profit):.6f}億円"
    )


if __name__ == "__main__":
    main()