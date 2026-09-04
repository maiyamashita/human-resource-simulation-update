#このファイル名はbackend/scenarios/scenario2.pyです。


from ortools.sat.python import cp_model

from app.common_optimizer import (
    build_common_model,
    create_solver,
    get_assignment_result,
)

DEPARTMENTS = ["A", "B", "C"]


def optimize_a_profit(employees):
    """
    シナリオ2:
    飽和事業であるA事業部の利益を最大化する
    社員配置を求める。
    """

    # 共通モデル
    model_data = build_common_model(employees)
    model = model_data["model"]

    # シナリオ2固有の目的関数
    model.Maximize(
        model_data["profit"]["A"]
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
        # 配置
        "assignment": assignment,

        # 全社
        "total_sales": solver.Value(
            model_data["total_sales"]
        ),

        "total_profit": solver.Value(
            model_data["total_profit"]
        ),

        # 事業部売上
        "sales": {
            department: solver.Value(
                model_data["final_sales"][department]
            )
            for department in DEPARTMENTS
        },

        # 事業部利益
        "profit": {
            department: solver.Value(
                model_data["profit"][department]
            )
            for department in DEPARTMENTS
        },

        # シナリオ固有目的値
        "profit_a": solver.Value(
            model_data["profit"]["A"]
        ),

        # 比較用
        "b_sales": solver.Value(
            model_data["final_sales"]["B"]
        ),

        "c_sales": solver.Value(
            model_data["final_sales"]["C"]
        ),

        # 人数
        "count": {
            department: solver.Value(
                model_data["count"][department]
            )
            for department in DEPARTMENTS
        },

        # 能力値
        "ability": {
            department: solver.Value(
                model_data["ability"][department]
            )
            for department in DEPARTMENTS
        },
    }