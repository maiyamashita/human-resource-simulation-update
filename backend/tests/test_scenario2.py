from app.csv_loader import load_employees
from app.contribution import calculate_all_contributions
from scenarios.scenario2 import optimize_a_profit


CSV_FILE = "human_resources_100.csv"


def main():
    employees = load_employees(CSV_FILE)

    # 貢献度を付与
    for employee in employees:
        employee["contributions"] = (
            calculate_all_contributions(employee)
        )

    # シナリオ2実行
    result = optimize_a_profit(employees)

    if result is None:
        print("解が見つかりませんでした。")
        return

    print("\n=== シナリオ2確認 ===")

    print("\n--- 配置人数 ---")

    for department, employee_ids in result["assignment"].items():
        print(
            f"{department}事業部: "
            f"{len(employee_ids)}名"
        )

    print("\n--- 能力値 ---")

    for department, ability in result["ability"].items():
        print(
            f"{department}: "
            f"{ability / 100:.2f}"
        )

    print("\n--- 事業部利益 ---")

    for department, profit in result["profit"].items():
        print(
            f"{department}: "
            f"{profit / 100_000_000:.6f}億円"
        )

    print("\n--- A事業部利益 ---")

    print(
        f"{result['profit_a'] / 100_000_000:.6f}億円"
    )

    print("\n--- 全社売上 ---")

    print(
        f"{result['total_sales'] / 100_000_000:.6f}億円"
    )

    print("\n--- 全社利益 ---")

    print(
        f"{result['total_profit'] / 100_000_000:.6f}億円"
    )


if __name__ == "__main__":
    main()