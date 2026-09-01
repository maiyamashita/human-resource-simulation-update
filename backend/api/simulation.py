#このファイル名はbackend/api/simulation.pyです。このコメントは消さないでください。

import tempfile
import os
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import Optional, List, Dict, Any, Union
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.csv_loader import load_employees
from app.contribution import calculate_all_contributions
from app.department_calculator import (
    calculate_sales,
    calculate_shortage_penalty,
    calculate_excess_penalty,
)

# 100名 通常モード用シナリオ
from scenarios.scenario1 import optimize_total_sales
from scenarios.scenario2 import optimize_a_profit
from scenarios.scenario3 import optimize_b_sales
from scenarios.scenario4 import optimize_c_sales

# ★ 追加採用・目標追従用動的最適化モジュール
# calculate_dynamic_settings: 総社員数Nに応じた適正人数・最低人数の算出（100名時比率での動的按分）
# recalculate（手動配置再計算）でも同じ基準を使うため、ロジックを複製せずここから再利用する。
from app.dynamic_optimizer import (
    optimize_dynamic_adoption,
    calculate_dynamic_settings,
)


app = FastAPI()

# ★ CPUマルチコアを活用した並列実行スレッドプール（高速化用）
executor = ThreadPoolExecutor(max_workers=4)

# CORS許可
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def prepare_employees_from_file(file_path: str):
    employees = load_employees(file_path)
    for employee in employees:
        employee["contributions"] = calculate_all_contributions(employee)
    return employees


def build_scenario_result(
    scenario_id,
    name,
    short_name,
    objective,
    result,
):
    if result is None:
        return None

    def yen_to_oku(val):
        if val is None:
            return 0.0
        return float(val) / 100_000_000.0

    def scale_ability(val):
        if val is None:
            return 0.0
        return float(val) / 100.0

    obj_val = (
        result.get("total_sales", 0)
        if scenario_id == 1
        else result.get(
            {
                2: "a_profit",
                3: "b_sales",
                4: "c_sales",
            }[scenario_id],
            0,
        )
    )

    return {
        "id": scenario_id,
        "name": name,
        "shortName": short_name,
        "objective": objective,
        "objectiveValue": yen_to_oku(obj_val),

        "totalSales": yen_to_oku(result.get("total_sales")),
        "totalProfit": yen_to_oku(result.get("total_profit")),

        "assignment": result.get("assignment", {"A": [], "B": [], "C": []}),

        "departments": {
            dept: {
                "count": int(result.get("count", {}).get(dept, 0)),
                "ability": scale_ability(result.get("ability", {}).get(dept)),
                "sales": yen_to_oku(result.get("sales", {}).get(dept)),
                "profit": yen_to_oku(result.get("profit", {}).get(dept)),
            }
            for dept in ["A", "B", "C"]
        },
    }


# ==================================================
# ① 初回CSVアップロード用（デフォルト目標 58.0億円）
# ==================================================
@app.post("/api/scenarios")
async def run_scenarios(file: UploadFile = File(...)):
    temp_file_path = None

    try:
        content = await file.read()

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".csv"
        ) as tmp:
            tmp.write(content)
            temp_file_path = tmp.name

        employees = prepare_employees_from_file(temp_file_path)

        result1 = optimize_total_sales(employees)
        result2 = optimize_a_profit(employees)
        result3 = optimize_b_sales(employees)
        result4 = optimize_c_sales(employees)

        if any(
            r is None
            for r in [result1, result2, result3, result4]
        ):
            raise HTTPException(
                status_code=500,
                detail="最適化結果を取得できませんでした。"
            )

        return {
            "scenarios": [
                build_scenario_result(
                    1,
                    "シナリオ1：全社売上最大化",
                    "全社売上",
                    "全社売上",
                    result1
                ),
                build_scenario_result(
                    2,
                    "シナリオ2：A事業部利益最大化",
                    "A利益",
                    "A事業部利益",
                    result2
                ),
                build_scenario_result(
                    3,
                    "シナリオ3：B事業部売上最大化",
                    "B売上",
                    "B事業部売上",
                    result3
                ),
                build_scenario_result(
                    4,
                    "シナリオ4：C事業部売上最大化",
                    "C売上",
                    "C事業部売上",
                    result4
                ),
            ]
        }

    except HTTPException:
        raise

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[with-adoption ERROR] {type(e).__name__}: {e}")

        raise HTTPException(
            status_code=400,
            detail=f"追加採用CSV処理または最適化エラー: {str(e)}"
        )
    finally:
        if temp_file_path and os.path.exists(temp_file_path):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass


# ==================================================
# ② 追加採用モード用
# ==================================================
@app.post("/api/scenarios/with-adoption")
async def run_adoption_scenarios(request: Request):
    temp_file_path = None

    try:
        form = await request.form()

        file_obj = form.get("file")
        candidates_raw = (
            form.get("candidates_json")
            or form.get("candidates")
            or "[]"
        )

        if not file_obj or not hasattr(file_obj, "read"):
            raise HTTPException(
                status_code=400,
                detail="CSVファイルが正しく送信されていません。"
            )

        content = await file_obj.read()

        with tempfile.NamedTemporaryFile(
            delete=False,
            suffix=".csv"
        ) as tmp:
            tmp.write(content)
            temp_file_path = tmp.name

        employees = prepare_employees_from_file(temp_file_path)

        # ------------------------------------------
        # 追加採用候補者を社員データへ追加
        # ------------------------------------------
        if isinstance(candidates_raw, str) and candidates_raw.strip():
            try:
                raw_candidates = json.loads(candidates_raw)

                for c in raw_candidates:
                    s_val = float(
                        c.get(
                            "sales_ability",
                            c.get("sales", 70)
                        )
                    )
                    m_val = float(
                        c.get(
                            "management_ability",
                            c.get("management", 60)
                        )
                    )
                    d_val = float(
                        c.get(
                            "development_ability",
                            c.get("development", 65)
                        )
                    )
                    t_val = float(
                        c.get(
                            "training_ability",
                            c.get("training", 60)
                        )
                    )

                    candidate_emp = {
                        "employee_id": str(
                            c.get("id", "NEW")
                        ),
                        "name": str(
                            c.get("name", "候補者")
                        ),
                        "sales": s_val,
                        "management": m_val,
                        "development": d_val,
                        "training": t_val,
                        "sales_ability": s_val,
                        "management_ability": m_val,
                        "development_ability": d_val,
                        "training_ability": t_val,
                        "cost": float(
                            c.get("cost", 10)
                        ),
                    }

                    candidate_emp["contributions"] = (
                        calculate_all_contributions(
                            candidate_emp
                        )
                    )

                    employees.append(candidate_emp)

            except Exception as parse_err:
                print(
                    f"候補者JSONパース警告: {parse_err}"
                )

        # ------------------------------------------
        # 4シナリオを並列実行
        # ------------------------------------------
        loop = asyncio.get_running_loop()

        task1 = loop.run_in_executor(
            executor,
            optimize_dynamic_adoption,
            employees,
            58.0,
            "total_sales"
        )

        task2 = loop.run_in_executor(
            executor,
            optimize_dynamic_adoption,
            employees,
            58.0,
            "a_profit"
        )

        task3 = loop.run_in_executor(
            executor,
            optimize_dynamic_adoption,
            employees,
            58.0,
            "b_sales"
        )

        task4 = loop.run_in_executor(
            executor,
            optimize_dynamic_adoption,
            employees,
            58.0,
            "c_sales"
        )

        result1, result2, result3, result4 = (
            await asyncio.gather(
                task1,
                task2,
                task3,
                task4
            )
        )

        if any(
            r is None
            for r in [
                result1,
                result2,
                result3,
                result4
            ]
        ):
            raise HTTPException(
                status_code=500,
                detail="追加採用の最適化結果を取得できませんでした。"
            )

        return {
            "scenarios": [
                build_scenario_result(
                    1,
                    "シナリオ1：全社売上最大化 (追加採用)",
                    "全社売上",
                    "全社売上",
                    result1
                ),
                build_scenario_result(
                    2,
                    "シナリオ2：A事業部利益最大化 (追加採用)",
                    "A利益",
                    "A事業部利益",
                    result2
                ),
                build_scenario_result(
                    3,
                    "シナリオ3：B事業部売上最大化 (追加採用)",
                    "B売上",
                    "B事業部売上",
                    result3
                ),
                build_scenario_result(
                    4,
                    "シナリオ4：C事業部売上最大化 (追加採用)",
                    "C売上",
                    "C事業部売上",
                    result4
                ),
            ]
        }

    except HTTPException:
        raise

    except Exception as e:
        import traceback
        traceback.print_exc()

        print(
            f"[with-adoption ERROR] "
            f"{type(e).__name__}: {e}"
        )

        raise HTTPException(
            status_code=400,
            detail=(
                "追加採用CSV処理または最適化エラー: "
                f"{str(e)}"
            )
        )

    finally:
        if (
            temp_file_path
            and os.path.exists(temp_file_path)
        ):
            try:
                os.remove(temp_file_path)
            except Exception:
                pass

# ==================================================
# ③ 手動配置変更 (What-if分析) リアルタイム再計算エンドポイント ★ 404解消用 ★
# ==================================================
@app.post("/api/scenarios/recalculate")
async def recalculate_manual_assignment(request: Request):
    """
    ユーザーが配属詳細タブで手動でメンバーを移動した際、
    リアルタイムで売上・利益を試算して返すエンドポイント
    """
    try:
        raw_body = await request.json()
        
        target_sales = 58.0
        if isinstance(raw_body, dict):
            target_sales = float(raw_body.get("target_sales", 58.0))
            employees_raw = (
                raw_body.get("employees") or 
                raw_body.get("payload") or 
                raw_body.get("data") or 
                [raw_body]
            )
        elif isinstance(raw_body, list):
            employees_raw = raw_body
        else:
            employees_raw = []

        dept_employees = {"A": [], "B": [], "C": []}
        assignment = {"A": [], "B": [], "C": []}

        for item in employees_raw:
            if not isinstance(item, dict):
                continue

            emp_id_str = str(item.get("employee_id") or item.get("id") or item.get("employeeId") or "")
            target_dept = str(item.get("assigned_dept") or item.get("dept") or "A")

            s_val = float(item.get("sales") or item.get("sales_ability") or item.get("salesAbility") or 60.0)
            m_val = float(item.get("management") or item.get("management_ability") or item.get("managementAbility") or 60.0)
            d_val = float(item.get("development") or item.get("development_ability") or item.get("developmentAbility") or 60.0)
            t_val = float(item.get("training") or item.get("training_ability") or item.get("trainingAbility") or 60.0)
            c_val = float(item.get("personnel_cost") or item.get("personnelCost") or item.get("cost") or 10.0)

            emp_dict = {
                "employee_id": emp_id_str,
                "sales": s_val,
                "management": m_val,
                "development": d_val,
                "training": t_val,
                "personnel_cost": c_val,
                "cost": c_val,
            }
            emp_dict["contributions"] = calculate_all_contributions(emp_dict)

            if target_dept in dept_employees:
                dept_employees[target_dept].append(emp_dict)
                assignment[target_dept].append(emp_id_str)

        departments_result = {}
        total_sales_billion = 0.0
        total_profit_billion = 0.0
        alerts = []

        # ------------------------------------------
        # 総社員数Nに応じた適正人数・最低人数
        #
        # 100名固定ではなく、実際に配置された総人数から
        # dynamic_optimizer.py と同じ基準（100名時比率での
        # 動的按分）を都度算出する。101〜109名等の特別扱いはしない。
        # ------------------------------------------
        total_employee_count = sum(
            len(v) for v in dept_employees.values()
        )

        appropriate_counts, min_counts = calculate_dynamic_settings(
            total_employee_count
        )

        for dept in ["A", "B", "C"]:
            emps = dept_employees[dept]
            emp_count = len(emps)

            if emp_count < min_counts[dept]:
                alerts.append({
                    "level": "warning",
                    "message": f"{dept}事業部の人員（{emp_count}名）が最低必要人数（{min_counts[dept]}名）を下回っています！"
                })

            # calculate_department_status 相当の計算を、
            # DEPARTMENT_SETTINGS の固定適正人数ではなく
            # 動的適正人数(appropriate_counts[dept])で行う。
            ability_value = sum(
                e["contributions"][dept] for e in emps
            )

            fulfillment_rate = (
                emp_count / appropriate_counts[dept]
                if appropriate_counts[dept]
                else 0.0
            )

            status = {
                "department": dept,
                "employee_count": emp_count,
                "ability_value": ability_value,
                "fulfillment_rate": fulfillment_rate,
                "shortage_penalty": calculate_shortage_penalty(
                    dept, fulfillment_rate
                ),
                "excess_penalty": calculate_excess_penalty(
                    fulfillment_rate
                ),
            }

            sales_info = calculate_sales(status)
            dept_sales_billion = sales_info["final_sales"]

            total_cost_million = sum(e.get("personnel_cost", 10.0) for e in emps) * 3.0
            total_cost_billion = total_cost_million / 100.0

            dept_profit_billion = dept_sales_billion - total_cost_billion

            departments_result[dept] = {
                "count": emp_count,
                "ability": status["ability_value"],
                "sales": dept_sales_billion,
                "profit": dept_profit_billion,
                "fulfillment_rate": status["fulfillment_rate"] * 100.0,
            }

            total_sales_billion += dept_sales_billion
            total_profit_billion += dept_profit_billion

        if total_sales_billion < target_sales:
            alerts.append({
                "level": "danger",
                "message": f"全社売上（{total_sales_billion:.2f}億円）が目標の{target_sales:.1f}億円に届いていません。"
            })

        return {
            "scenario": {
                "id": 99,
                "name": "手動調整案 (試算結果)",
                "shortName": "手動調整",
                "objective": "手動調整",
                "objectiveValue": total_sales_billion,
                "totalSales": total_sales_billion,
                "totalProfit": total_profit_billion,
                "assignment": assignment,
                "departments": departments_result,
            },
            "meta": {
                "alerts": alerts
            }
        }

    except Exception as e:
        print(f"再計算エラー詳細: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=f"配置再計算エラー: {str(e)}",
        )


# ==================================================
# ④ 目標売上（target_sales）による全シナリオ再最適化（ブレない絶対最適解を返却）
# ==================================================
@app.post("/api/scenarios/reoptimize")
async def reoptimize_with_target(request: Request):
    """
    目標金額がいくら変更されても各シナリオ本来の最高パフォーマンス（実力値）を崩さず、
    ブレない正確な最適解を高速に返却するエンドポイント
    """
    try:
        raw_body = await request.json()
        employees_raw = raw_body.get("employees", [])

        # 送信された社員データの共通フォーマット整形
        employees = []
        for e in employees_raw:
            emp_dict = {
                "employee_id": str(e.get("employee_id") or e.get("id") or ""),
                "sales": float(e.get("sales") or e.get("sales_ability") or 60.0),
                "management": float(e.get("management") or e.get("management_ability") or 60.0),
                "development": float(e.get("development") or e.get("development_ability") or 60.0),
                "training": float(e.get("training") or e.get("training_ability") or 60.0),
                "personnel_cost": float(e.get("personnel_cost") or e.get("cost") or 10.0),
                "cost": float(e.get("personnel_cost") or e.get("cost") or 10.0),
            }
            emp_dict["contributions"] = calculate_all_contributions(emp_dict)
            employees.append(emp_dict)

        loop = asyncio.get_running_loop()

        # 58.0億円の下限ハード制約に基づいて純粋な最高のパフォーマンス（4シナリオ）を同時並列計算
        task1 = loop.run_in_executor(executor, optimize_dynamic_adoption, employees, 58.0, "total_sales")
        task2 = loop.run_in_executor(executor, optimize_dynamic_adoption, employees, 58.0, "a_profit")
        task3 = loop.run_in_executor(executor, optimize_dynamic_adoption, employees, 58.0, "b_sales")
        task4 = loop.run_in_executor(executor, optimize_dynamic_adoption, employees, 58.0, "c_sales")

        res1, res2, res3, res4 = await asyncio.gather(task1, task2, task3, task4)

        # 解が得られなかった場合の安全なフォールバック
        if res1 is None: res1 = optimize_total_sales(employees)
        if res2 is None: res2 = optimize_a_profit(employees)
        if res3 is None: res3 = optimize_b_sales(employees)
        if res4 is None: res4 = optimize_c_sales(employees)

        return {
            "scenarios": [
                build_scenario_result(1, "シナリオ1：全社売上最大化", "全社売上", "全社売上", res1),
                build_scenario_result(2, "シナリオ2：A事業部利益最大化", "A利益", "A事業部利益", res2),
                build_scenario_result(3, "シナリオ3：B事業部売上最大化", "B売上", "B事業部売上", res3),
                build_scenario_result(4, "シナリオ4：C事業部売上最大化", "C売上", "C事業部売上", res4),
            ]
        }
    except Exception as e:
        print(f"目標再最適化エラー: {str(e)}")
        raise HTTPException(status_code=400, detail=f"再最適化エラー: {str(e)}")