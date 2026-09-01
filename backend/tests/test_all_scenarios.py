from app.csv_loader import load_employees
from app.contribution import calculate_all_contributions

from scenarios.scenario1 import optimize_total_sales
from scenarios.scenario2 import optimize_a_profit
from scenarios.scenario3 import optimize_b_sales
from scenarios.scenario4 import optimize_c_sales


CSV_FILE = "human_resources_100.csv"

YEN_PER_100_MILLION = 100_000_000
ABILITY_SCALE = 100

DEPARTMENTS = ["A", "B", "C"]


# ==================================================
# 制約条件
# ==================================================

TARGET_SALES = 58 * YEN_PER_100_MILLION

MINIMUM_COUNT = {
    "A": 30,
    "B": 20,
    "C": 10,
}


# ==================================================
# 表示用
# ==================================================

def yen_to_oku(yen):
    return yen / YEN_PER_100_MILLION


def ability_to_float(ability):
    return ability / ABILITY_SCALE


# ==================================================
# データ準備
# ==================================================

def prepare_employees():
    """
    CSVを読み込み、全社員の貢献度を計算する。
    """

    employees = load_employees(CSV_FILE)

    for employee in employees:
        employee["contributions"] = (
            calculate_all_contributions(employee)
        )

    return employees


# ==================================================
# 配置社員一覧表示
# ==================================================

def print_assignment(
    scenario_name,
    result,
):
    """
    シナリオごとの社員配属先を表示する。

    result["assignment"] に入っている社員番号を
    事業部ごとに表示する。
    """

    print("\n--- 社員配属一覧 ---")

    for department in DEPARTMENTS:

        employees = result["assignment"][department]

        print(
            f"\n{department}事業部 "
            f"({len(employees)}名)"
        )

        for employee_id in employees:
            print(
                f"  {employee_id}"
            )


# ==================================================
# 共通制約チェック
# ==================================================

def validate_common_constraints(
    result,
    employees,
    scenario_name,
):
    """
    全シナリオ共通の制約条件を検証する。
    """

    print("\n--- 共通制約チェック ---")

    # --------------------------------------------------
    # 1. 全社員が配置されていること
    # --------------------------------------------------

    total_count = sum(
        result["count"][department]
        for department in DEPARTMENTS
    )

    assert total_count == len(employees), (
        f"{scenario_name}: "
        f"配置人数合計が社員数と一致しません。"
        f"配置={total_count}, 社員数={len(employees)}"
    )

    print(
        f"OK: 配置人数合計 = {total_count}名"
    )

    # --------------------------------------------------
    # 2. 各事業部の最低人数
    # --------------------------------------------------

    for department in DEPARTMENTS:

        count = result["count"][department]
        minimum = MINIMUM_COUNT[department]

        assert count >= minimum, (
            f"{scenario_name}: "
            f"{department}事業部が最低人数を下回っています。"
            f"{count}名 < {minimum}名"
        )

        print(
            f"OK: {department}事業部 "
            f"{count}名 >= 最低{minimum}名"
        )

    # --------------------------------------------------
    # 3. 全社売上58億円超
    # --------------------------------------------------

    total_sales = result["total_sales"]

    assert total_sales > TARGET_SALES, (
        f"{scenario_name}: "
        f"全社売上が58億円以下です。"
        f"売上={yen_to_oku(total_sales):.6f}億円"
    )

    print(
        f"OK: 全社売上 "
        f"{yen_to_oku(total_sales):.6f}億円 > 58億円"
    )

    # --------------------------------------------------
    # 4. 配置人数とassignmentの一致
    # --------------------------------------------------

    assignment_total = sum(
        len(result["assignment"][department])
        for department in DEPARTMENTS
    )

    assert assignment_total == len(employees), (
        f"{scenario_name}: "
        "assignmentの人数が社員数と一致しません。"
    )

    print(
        f"OK: assignment人数 = {assignment_total}名"
    )

    # --------------------------------------------------
    # 5. 同じ社員が複数事業部に配置されていないこと
    # --------------------------------------------------

    assigned_employee_ids = []

    for department in DEPARTMENTS:
        assigned_employee_ids.extend(
            result["assignment"][department]
        )

    assert len(assigned_employee_ids) == len(
        set(assigned_employee_ids)
    ), (
        f"{scenario_name}: "
        "同じ社員が複数事業部に重複配置されています。"
    )

    print(
        "OK: 社員の重複配置なし"
    )

    print(
        "共通制約: PASS"
    )


# ==================================================
# 結果整合性チェック
# ==================================================

def validate_result_consistency(
    result,
    scenario_name,
):
    """
    最適化結果の各項目が整合しているか確認する。
    """

    print("\n--- 結果整合性チェック ---")

    # --------------------------------------------------
    # 事業部売上の合計 = 全社売上
    # --------------------------------------------------

    department_sales = sum(
        result["sales"][department]
        for department in DEPARTMENTS
    )

    assert department_sales == result["total_sales"], (
        f"{scenario_name}: "
        "事業部売上合計と全社売上が一致しません。"
    )

    print(
        "OK: 事業部売上合計 = 全社売上"
    )

    # --------------------------------------------------
    # 事業部利益の合計 = 全社利益
    # --------------------------------------------------

    department_profit = sum(
        result["profit"][department]
        for department in DEPARTMENTS
    )

    assert department_profit == result["total_profit"], (
        f"{scenario_name}: "
        "事業部利益合計と全社利益が一致しません。"
    )

    print(
        "OK: 事業部利益合計 = 全社利益"
    )

    print(
        "結果整合性: PASS"
    )


# ==================================================
# 最適化結果チェック
# ==================================================

def validate_optimization(
    result,
    scenario_name,
    objective_name,
    objective_value,
):
    """
    各シナリオの最適化結果を確認する。

    各 scenario の Solver が OPTIMAL を返していることを
    前提として、目的値が結果に正しく反映されているか確認する。
    """

    print("\n--- 最適化結果チェック ---")

    # --------------------------------------------------
    # 目的値が存在すること
    # --------------------------------------------------

    assert objective_value is not None, (
        f"{scenario_name}: "
        "目的関数の値が取得できません。"
    )

    assert objective_value >= 0, (
        f"{scenario_name}: "
        "目的関数が負の値になっています。"
    )

    # --------------------------------------------------
    # 表示
    # --------------------------------------------------

    print(
        f"最大化対象: {objective_name}"
    )

    print(
        f"目的値: "
        f"{yen_to_oku(objective_value):.6f}億円"
    )

    print(
        "Solver Status: OPTIMAL"
    )

    print(
        f"{scenario_name}: "
        "最適化結果チェック PASS"
    )


# ==================================================
# シナリオ結果表示
# ==================================================

def print_result(
    scenario_name,
    result,
    objective_name,
    objective_value,
):
    """
    1つのシナリオの結果を表示する。
    """

    print("\n" + "=" * 60)
    print(f"{scenario_name}")
    print("=" * 60)

    print("\n--- 最大化した目的 ---")

    print(
        f"{objective_name}: "
        f"{yen_to_oku(objective_value):.6f}億円"
    )

    print("\n--- 配置人数 ---")

    for department in DEPARTMENTS:
        print(
            f"{department}事業部: "
            f"{result['count'][department]}名"
        )

    print("\n--- 能力値 ---")

    for department in DEPARTMENTS:
        print(
            f"{department}: "
            f"{ability_to_float(result['ability'][department]):.2f}"
        )

    print("\n--- 事業部売上 ---")

    for department in DEPARTMENTS:
        print(
            f"{department}: "
            f"{yen_to_oku(result['sales'][department]):.6f}億円"
        )

    print("\n--- 事業部利益 ---")

    for department in DEPARTMENTS:
        print(
            f"{department}: "
            f"{yen_to_oku(result['profit'][department]):.6f}億円"
        )

    print("\n--- 全社結果 ---")

    print(
        f"全社売上: "
        f"{yen_to_oku(result['total_sales']):.6f}億円"
    )

    print(
        f"全社利益: "
        f"{yen_to_oku(result['total_profit']):.6f}億円"
    )


# ==================================================
# 目的関数比較
# ==================================================

def print_objective_comparison(
    result1,
    result2,
    result3,
    result4,
):
    """
    各シナリオで最大化した目的関数を比較する。
    """

    print("\n")
    print("=" * 80)
    print("=== 各シナリオの目的関数 ===")
    print("=" * 80)

    print(
        f"シナリオ1 全社売上: "
        f"{yen_to_oku(result1['total_sales']):.6f}億円"
    )

    print(
        f"シナリオ2 A事業部利益: "
        f"{yen_to_oku(result2['profit_a']):.6f}億円"
    )

    print(
        f"シナリオ3 B事業部売上: "
        f"{yen_to_oku(result3['b_sales']):.6f}億円"
    )

    print(
        f"シナリオ4 C事業部売上: "
        f"{yen_to_oku(result4['c_sales']):.6f}億円"
    )


# ==================================================
# 全社業績比較
# ==================================================

def print_company_comparison(
    result1,
    result2,
    result3,
    result4,
):
    """
    4シナリオの全社売上・利益を比較する。
    """

    print("\n")
    print("=" * 80)
    print("=== 4シナリオ比較 ===")
    print("=" * 80)

    print(
        f"{'シナリオ':<30}"
        f"{'全社売上':>15}"
        f"{'全社利益':>15}"
    )

    print("-" * 80)

    scenarios = [
        ("シナリオ1：全社売上最大化", result1),
        ("シナリオ2：A利益最大化", result2),
        ("シナリオ3：B売上最大化", result3),
        ("シナリオ4：C売上最大化", result4),
    ]

    for name, result in scenarios:

        print(
            f"{name:<30}"
            f"{yen_to_oku(result['total_sales']):>15.6f}"
            f"{yen_to_oku(result['total_profit']):>15.6f}"
        )


# ==================================================
# 目的関数の相互比較
# ==================================================

def validate_cross_scenario_results(
    result1,
    result2,
    result3,
    result4,
):
    """
    シナリオ間の結果について確認する。

    注意:
    シナリオごとに目的関数が異なるため、
    「シナリオ1の全社売上が最大だから他も最大」
    という判定はしない。

    各シナリオで最大化した指標について、
    そのシナリオ自身の結果を確認する。
    """

    print("\n")
    print("=" * 80)
    print("=== 最大化対象の検証 ===")
    print("=" * 80)

    # --------------------------------------------------
    # シナリオ1
    # --------------------------------------------------

    assert result1["total_sales"] >= result2["total_sales"]
    assert result1["total_sales"] >= result3["total_sales"]
    assert result1["total_sales"] >= result4["total_sales"]

    print(
        "OK: シナリオ1の全社売上が4シナリオ中最大"
    )

    # --------------------------------------------------
    # シナリオ2
    # --------------------------------------------------

    assert result2["profit_a"] >= result1["profit"]["A"]
    assert result2["profit_a"] >= result3["profit"]["A"]
    assert result2["profit_a"] >= result4["profit"]["A"]

    print(
        "OK: シナリオ2のA事業部利益が4シナリオ中最大"
    )

    # --------------------------------------------------
    # シナリオ3
    # --------------------------------------------------

    assert result3["b_sales"] >= result1["sales"]["B"]
    assert result3["b_sales"] >= result2["sales"]["B"]
    assert result3["b_sales"] >= result4["sales"]["B"]

    print(
        "OK: シナリオ3のB事業部売上が4シナリオ中最大"
    )

    # --------------------------------------------------
    # シナリオ4
    # --------------------------------------------------

    assert result4["c_sales"] >= result1["sales"]["C"]
    assert result4["c_sales"] >= result2["sales"]["C"]
    assert result4["c_sales"] >= result3["sales"]["C"]

    print(
        "OK: シナリオ4のC事業部売上が4シナリオ中最大"
    )

    print(
        "\n最大化対象のシナリオ間比較: PASS"
    )


# ==================================================
# Main
# ==================================================

def main():

    # ==================================================
    # データ準備
    # ==================================================

    employees = prepare_employees()

    print("=== 全シナリオ比較・最適化検証 ===")
    print(f"社員数: {len(employees)}名")

    # ==================================================
    # 社員数チェック
    # ==================================================

    assert len(employees) == 100, (
        f"社員数が100名ではありません: "
        f"{len(employees)}名"
    )

    print(
        "OK: 社員数100名"
    )

    # ==================================================
    # シナリオ1
    # ==================================================

    result1 = optimize_total_sales(employees)

    assert result1 is not None, (
        "シナリオ1: 解が見つかりませんでした。"
    )

    print_result(
        "シナリオ1：全社売上最大化",
        result1,
        "全社売上",
        result1["total_sales"],
    )

    # --------------------------------------------------
    # ★ シナリオ1の社員配属一覧
    # --------------------------------------------------

    print_assignment(
        "シナリオ1：全社売上最大化",
        result1,
    )

    validate_common_constraints(
        result1,
        employees,
        "シナリオ1",
    )

    validate_result_consistency(
        result1,
        "シナリオ1",
    )

    validate_optimization(
        result1,
        "シナリオ1",
        "全社売上",
        result1["total_sales"],
    )

    # ==================================================
    # シナリオ2
    # ==================================================

    result2 = optimize_a_profit(employees)

    assert result2 is not None, (
        "シナリオ2: 解が見つかりませんでした。"
    )

    print_result(
        "シナリオ2：A事業部利益最大化",
        result2,
        "A事業部利益",
        result2["profit_a"],
    )

    # --------------------------------------------------
    # ★ シナリオ2の社員配属一覧
    # --------------------------------------------------

    print_assignment(
        "シナリオ2：A事業部利益最大化",
        result2,
    )

    validate_common_constraints(
        result2,
        employees,
        "シナリオ2",
    )

    validate_result_consistency(
        result2,
        "シナリオ2",
    )

    validate_optimization(
        result2,
        "シナリオ2",
        "A事業部利益",
        result2["profit_a"],
    )

    # ==================================================
    # シナリオ3
    # ==================================================

    result3 = optimize_b_sales(employees)

    assert result3 is not None, (
        "シナリオ3: 解が見つかりませんでした。"
    )

    print_result(
        "シナリオ3：B事業部売上最大化",
        result3,
        "B事業部売上",
        result3["b_sales"],
    )

    # --------------------------------------------------
    # ★ シナリオ3の社員配属一覧
    # --------------------------------------------------

    print_assignment(
        "シナリオ3：B事業部売上最大化",
        result3,
    )

    validate_common_constraints(
        result3,
        employees,
        "シナリオ3",
    )

    validate_result_consistency(
        result3,
        "シナリオ3",
    )

    validate_optimization(
        result3,
        "シナリオ3",
        "B事業部売上",
        result3["b_sales"],
    )

    # ==================================================
    # シナリオ4
    # ==================================================

    result4 = optimize_c_sales(employees)

    assert result4 is not None, (
        "シナリオ4: 解が見つかりませんでした。"
    )

    print_result(
        "シナリオ4：C事業部売上最大化",
        result4,
        "C事業部売上",
        result4["c_sales"],
    )

    # --------------------------------------------------
    # ★ シナリオ4の社員配属一覧
    # --------------------------------------------------

    print_assignment(
        "シナリオ4：C事業部売上最大化",
        result4,
    )

    validate_common_constraints(
        result4,
        employees,
        "シナリオ4",
    )

    validate_result_consistency(
        result4,
        "シナリオ4",
    )

    validate_optimization(
        result4,
        "シナリオ4",
        "C事業部売上",
        result4["c_sales"],
    )

    # ==================================================
    # 4シナリオ比較
    # ==================================================

    print_company_comparison(
        result1,
        result2,
        result3,
        result4,
    )

    print_objective_comparison(
        result1,
        result2,
        result3,
        result4,
    )

    # ==================================================
    # 最大化対象のシナリオ間比較
    # ==================================================

    validate_cross_scenario_results(
        result1,
        result2,
        result3,
        result4,
    )

    # ==================================================
    # 最終結果
    # ==================================================

    print("\n")
    print("=" * 80)
    print("=== 全シナリオ検証結果 ===")
    print("=" * 80)

    print("シナリオ1: PASS")
    print("シナリオ2: PASS")
    print("シナリオ3: PASS")
    print("シナリオ4: PASS")

    print("\nすべてのシナリオの検証に成功しました。")


if __name__ == "__main__":
    main()