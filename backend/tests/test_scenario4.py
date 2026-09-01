from app.csv_loader import load_employees
from app.contribution import calculate_all_contributions
from scenarios.scenario4 import optimize_c_sales


CSV_FILE = "human_resources_100.csv"


def main():
    # CSV読み込み
    employees = load_employees(CSV_FILE)

    # 貢献度を付与
    for employee in employees:
        employee["contributions"] = (
            calculate_all_contributions(employee)
        )

    # シナリオ4実行
    result = optimize_c_sales(employees)

    if result is None:
        print("解が見つかりませんでした。")
        return

    print("\n=== シナリオ4確認 ===")

    # 配置人数
    print("\n--- 配置人数 ---")

    for department, employee_ids in result["assignment"].items():
        print(
            f"{department}事業部: "
            f"{len(employee_ids)}名"
        )

    # 能力値
    print("\n--- 能力値 ---")

    for department, ability in result["ability"].items():
        print(
            f"{department}: "
            f"{ability / 100:.2f}"
        )

    # 事業部売上
    print("\n--- 事業部売上 ---")

    for department, sales in result["sales"].items():
        print(
            f"{department}: "
            f"{sales / 100_000_000:.6f}億円"
        )

    # C事業部売上
    print("\n--- C事業部売上 ---")

    print(
        f"{result['c_sales'] / 100_000_000:.6f}億円"
    )

    # 全社売上
    print("\n--- 全社売上 ---")

    print(
        f"{result['total_sales'] / 100_000_000:.6f}億円"
    )

    # 全社利益
    print("\n--- 全社利益 ---")

    print(
        f"{result['total_profit'] / 100_000_000:.6f}億円"
    )


if __name__ == "__main__":
    main()