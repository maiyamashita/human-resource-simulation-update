#このファイル名はbackend/scenarios/scenario4.pyです。

from ortools.sat.python import cp_model

from app.common_optimizer import (
    build_common_model,
    create_solver,
    get_assignment_result,
)

DEPARTMENTS = ["A", "B", "C"]


def optimize_c_sales(employees):
    """
    シナリオ4:
    新規事業であるC事業部の売上を最大化する社員配置を求める。
    """

    # 共通モデルを構築
    model_data = build_common_model(employees)
    model = model_data["model"]

    # シナリオ4固有の目的関数
    # C事業部の売上を最大化
    model.Maximize(
        model_data["final_sales"]["C"]
    )

    # 求解
    solver = create_solver()
    status = solver.Solve(model)

    print(
        f"Solver Status: {solver.StatusName(status)}"
    )

    if status not in (
        cp_model.OPTIMAL,
        cp_model.FEASIBLE,
    ):
        return None

    # 配置結果
    assignment = get_assignment_result(
        employees,
        model_data["assignment"],
        solver,
    )

    return {
        "assignment": assignment,

        "total_sales": solver.Value(
            model_data["total_sales"]
        ),

        "c_sales": solver.Value(
            model_data["final_sales"]["C"]
        ),

        "count": {
            department: solver.Value(
                model_data["count"][department]
            )
            for department in DEPARTMENTS
        },

        "ability": {
            department: solver.Value(
                model_data["ability"][department]
            )
            for department in DEPARTMENTS
        },

        "sales": {
            department: solver.Value(
                model_data["final_sales"][department]
            )
            for department in DEPARTMENTS
        },

        "profit": {
            department: solver.Value(
                model_data["profit"][department]
            )
            for department in DEPARTMENTS
        },

        "total_profit": solver.Value(
            model_data["total_profit"]
        ),
    }