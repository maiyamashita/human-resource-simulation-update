#このファイル名はbackend/scenarios/scenario1.pyです。


from ortools.sat.python import cp_model

from app.common_optimizer import (
    build_common_model,
    create_solver,
    get_assignment_result,
)


DEPARTMENTS = ["A", "B", "C"]


def optimize_total_sales(employees):
    """
    シナリオ1:
    全社売上を最大化する社員配置を求める。
    """

    # ==================================================
    # 1. 共通モデルを構築
    # ==================================================

    model_data = build_common_model(employees)
    model = model_data["model"]

    # ==================================================
    # 2. シナリオ1固有の目的関数
    # ==================================================

    # 全社売上を最大化
    model.Maximize(
        model_data["total_sales"]
    )

    # ==================================================
    # 3. 求解
    # ==================================================

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

    # ==================================================
    # 4. 最適配置を取得
    # ==================================================

    assignment = get_assignment_result(
        employees,
        model_data["assignment"],
        solver,
    )

    # ==================================================
    # 5. 結果を返す
    # ==================================================

    return {
        # ------------------------------
        # 配置
        # ------------------------------

        "assignment": assignment,

        # ------------------------------
        # 全社売上
        # ------------------------------

        "total_sales": solver.Value(
            model_data["total_sales"]
        ),

        # ------------------------------
        # 全社利益
        #
        # 比較用
        # ------------------------------

        "total_profit": solver.Value(
            model_data["total_profit"]
        ),

        # ------------------------------
        # 事業部売上
        #
        # 比較用
        # ------------------------------

        "sales": {
            department: solver.Value(
                model_data["final_sales"][department]
            )
            for department in DEPARTMENTS
        },

        # ------------------------------
        # 事業部利益
        #
        # 比較用
        # ------------------------------

        "profit": {
            department: solver.Value(
                model_data["profit"][department]
            )
            for department in DEPARTMENTS
        },

        # ------------------------------
        # シナリオ2～4との比較用
        # ------------------------------

        "a_profit": solver.Value(
            model_data["profit"]["A"]
        ),

        "b_sales": solver.Value(
            model_data["final_sales"]["B"]
        ),

        "c_sales": solver.Value(
            model_data["final_sales"]["C"]
        ),

        # ------------------------------
        # 事業部人数
        # ------------------------------

        "count": {
            department: solver.Value(
                model_data["count"][department]
            )
            for department in DEPARTMENTS
        },

        # ------------------------------
        # 事業部能力値
        # ------------------------------

        "ability": {
            department: solver.Value(
                model_data["ability"][department]
            )
            for department in DEPARTMENTS
        },
    }
