#このファイル名はbackend/app/feasibility_checker.pyです。

from app.department_calculator import calculate_department_status
from app.department_calculator import calculate_sales


def check_current_assignment(employees, assignment):
    """
    CP-SATが出した現在の配置について、
    事業部能力値・ペナルティ・売上・全社売上を確認する。
    """

    total_sales = 0

    print("\n--- 58億円達成可能性の確認 ---")

    for department in ["A", "B", "C"]:

        # この事業部に配置された社員
        department_employees = [
            employee
            for employee in employees
            if employee["employee_id"] in assignment[department]
        ]

        # 事業部能力値・充足率・ペナルティを計算
        department_result = calculate_department_status(
            department,
            department_employees
        )

        # 売上を計算
        sales_result = calculate_sales(
            department_result
        )

        total_sales += sales_result["final_sales"]

        print(
            f"{department}事業部: "
            f"{department_result['employee_count']}名 / "
            f"能力値 {department_result['ability_value']:.2f} / "
            f"最終売上 {sales_result['final_sales']:.2f}億円"
        )

    print("\n--- 結果 ---")
    print(f"全社売上: {total_sales:.2f}億円")

    if total_sales > 58:
        print("58億円を超えています。")
    else:
        print("58億円を超えていません。")

    return total_sales