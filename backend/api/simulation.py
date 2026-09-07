#このファイル名はbackend/api/simulation.pyです。このコメントは消さないでください。

import tempfile
import os
import json
import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

# 許可するフロントエンドのURLを追加
origins = [
    "https://maiyamashita.github.io/human-resource-simulation-update/", # これから公開するGitHub PagesのURL
    "http://localhost:4200",          # パソコンでの開発用
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- ここから下にいつものAPIの処理が続く ---

from concurrent.futures import ThreadPoolExecutor
from typing import Optional, List, Dict, Any, Union
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from app.csv_loader import load_employees
from app.contribution import calculate_all_contributions
from app.department_calculator import (
    DEPARTMENT_SETTINGS,
    calculate_sales,
    calculate_shortage_penalty,
    calculate_excess_penalty,
)

# ★ 希望の補完・合致率計算モジュール
from app.preference_calculator import (
    enrich_employees_with_preferences,
    calculate_preference_match,
)

# 100名 通常モード用シナリオ
from scenarios.scenario1 import optimize_total_sales
from scenarios.scenario2 import optimize_a_profit
from scenarios.scenario3 import optimize_b_sales
from scenarios.scenario4 import optimize_c_sales

# ★ 追加採用・目標追従用動的最適化モジュール
from app.dynamic_optimizer import (
    optimize_dynamic_adoption,
    calculate_dynamic_settings,
)

# ★ 「必要人材の目安」機能
from app.adoption_threshold import compute_adoption_threshold_table


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
    
    # 社員データに潜在希望を自動補完（CSVにない場合）
    employees = enrich_employees_with_preferences(employees)
    return employees


def build_scenario_result(
    scenario_id,
    name,
    short_name,
    objective,
    result,
    employees=None,
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

    dynamic_settings = result.get("dynamic_settings")

    if dynamic_settings:
        appropriate_counts = dynamic_settings["appropriate_counts"]
        minimum_counts = dynamic_settings["minimum_counts"]
    else:
        appropriate_counts = {
            dept: DEPARTMENT_SETTINGS[dept]["appropriate_count"]
            for dept in ["A", "B", "C"]
        }
        minimum_counts = {
            dept: DEPARTMENT_SETTINGS[dept]["minimum_count"]
            for dept in ["A", "B", "C"]
        }

    assignment = result.get("assignment", {"A": [], "B": [], "C": []})

    # 希望合致率データの算出
    preference_match = (
        calculate_preference_match(assignment, employees)
        if employees
        else {
            "firstChoiceMatchCount": 0,
            "secondChoiceMatchCount": 0,
            "matchRate": 0.0,
            "totalCount": 0,
        }
    )

    return {
        "id": scenario_id,
        "name": name,
        "shortName": short_name,
        "objective": objective,
        "objectiveValue": yen_to_oku(obj_val),

        "totalSales": yen_to_oku(result.get("total_sales")),
        "totalProfit": yen_to_oku(result.get("total_profit")),

        "assignment": assignment,

        "departments": {
            dept: {
                "count": int(result.get("count", {}).get(dept, 0)),
                "ability": scale_ability(result.get("ability", {}).get(dept)),
                "sales": yen_to_oku(result.get("sales", {}).get(dept)),
                "profit": yen_to_oku(result.get("profit", {}).get(dept)),
            }
            for dept in ["A", "B", "C"]
        },

        "appropriateCounts": appropriate_counts,
        "minimumCounts": minimum_counts,

        # ★ 全社希望合致率オブジェクトを返却型に追加
        "preferenceMatch": preference_match,
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
                    result1,
                    employees,
                ),
                build_scenario_result(
                    2,
                    "シナリオ2：A事業部利益最大化",
                    "A利益",
                    "A事業部利益",
                    result2,
                    employees,
                ),
                build_scenario_result(
                    3,
                    "シナリオ3：B事業部売上最大化",
                    "B売上",
                    "B事業部売上",
                    result3,
                    employees,
                ),
                build_scenario_result(
                    4,
                    "シナリオ4：C事業部売上最大化",
                    "C売上",
                    "C事業部売上",
                    result4,
                    employees,
                ),
            ]
        }

    except HTTPException:
        raise

    except Exception as e:
        import traceback
        traceback.print_exc()
        print(f"[scenarios ERROR] {type(e).__name__}: {e}")

        raise HTTPException(
            status_code=400,
            detail=f"CSV処理または最適化エラー: {str(e)}"
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
                    s_val = float(c.get("sales_ability", c.get("sales", 70)))
                    m_val = float(c.get("management_ability", c.get("management", 60)))
                    d_val = float(c.get("development_ability", c.get("development", 65)))
                    t_val = float(c.get("training_ability", c.get("training", 60)))

                    candidate_emp = {
                        "employee_id": str(c.get("id", "NEW")),
                        "name": str(c.get("name", "候補者")),
                        "sales": s_val,
                        "management": m_val,
                        "development": d_val,
                        "training": t_val,
                        "sales_ability": s_val,
                        "management_ability": m_val,
                        "development_ability": d_val,
                        "training_ability": t_val,
                        "cost": float(c.get("cost", 10)),
                        "preferred_dept": str(c.get("preferred_dept", c.get("desiredDepartment", ""))),
                    }

                    candidate_emp["contributions"] = calculate_all_contributions(candidate_emp)

                    employees.append(candidate_emp)

                # 候補者も含めて潜在希望を一括補完
                employees = enrich_employees_with_preferences(employees)

            except Exception as parse_err:
                print(f"候補者JSONパース警告: {parse_err}")

        # ------------------------------------------
        # 4シナリオを並列実行
        # ------------------------------------------
        loop = asyncio.get_running_loop()

        task1 = loop.run_in_executor(
            executor, optimize_dynamic_adoption, employees, 58.0, "total_sales"
        )
        task2 = loop.run_in_executor(
            executor, optimize_dynamic_adoption, employees, 58.0, "a_profit"
        )
        task3 = loop.run_in_executor(
            executor, optimize_dynamic_adoption, employees, 58.0, "b_sales"
        )
        task4 = loop.run_in_executor(
            executor, optimize_dynamic_adoption, employees, 58.0, "c_sales"
        )

        result1, result2, result3, result4 = await asyncio.gather(
            task1, task2, task3, task4
        )

        if any(r is None for r in [result1, result2, result3, result4]):
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
                    result1,
                    employees,
                ),
                build_scenario_result(
                    2,
                    "シナリオ2：A事業部利益最大化 (追加採用)",
                    "A利益",
                    "A事業部利益",
                    result2,
                    employees,
                ),
                build_scenario_result(
                    3,
                    "シナリオ3：B事業部売上最大化 (追加採用)",
                    "B売上",
                    "B事業部売上",
                    result3,
                    employees,
                ),
                build_scenario_result(
                    4,
                    "シナリオ4：C事業部売上最大化 (追加採用)",
                    "C売上",
                    "C事業部売上",
                    result4,
                    employees,
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
# ③ 手動配置変更 (What-if分析) リアルタイム再計算エンドポイント
# ==================================================
@app.post("/api/scenarios/recalculate")
async def recalculate_manual_assignment(request: Request):
    """
    ユーザーが配属詳細タブで手動でメンバーを移動した際、
    リアルタイムで売上・利益・希望合致率を試算して返すエンドポイント
    """
    try:
        raw_body = await request.json()

        target_sales = 58.0
        if isinstance(raw_body, dict):
            target_sales = float(raw_body.get("target_sales", 58.0))
            employees_raw = (
                raw_body.get("employees")
                or raw_body.get("payload")
                or raw_body.get("data")
                or [raw_body]
            )
        elif isinstance(raw_body, list):
            employees_raw = raw_body
        else:
            employees_raw = []

        dept_employees = {"A": [], "B": [], "C": []}
        assignment = {"A": [], "B": [], "C": []}
        all_employees_list = []

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
            p_dept = str(item.get("preferred_dept") or item.get("desiredDepartment") or "")

            emp_dict = {
                "employee_id": emp_id_str,
                "sales": s_val,
                "management": m_val,
                "development": d_val,
                "training": t_val,
                "personnel_cost": c_val,
                "cost": c_val,
                "preferred_dept": p_dept,
            }
            emp_dict["contributions"] = calculate_all_contributions(emp_dict)

            all_employees_list.append(emp_dict)

            if target_dept in dept_employees:
                dept_employees[target_dept].append(emp_dict)
                assignment[target_dept].append(emp_id_str)

        # 潜在希望の自動補完
        all_employees_list = enrich_employees_with_preferences(all_employees_list)

        departments_result = {}
        total_sales_billion = 0.0
        total_profit_billion = 0.0
        alerts = []

        total_employee_count = sum(len(v) for v in dept_employees.values())

        appropriate_counts, min_counts = calculate_dynamic_settings(total_employee_count)

        for dept in ["A", "B", "C"]:
            emps = dept_employees[dept]
            emp_count = len(emps)

            if emp_count < min_counts[dept]:
                alerts.append({
                    "level": "warning",
                    "message": f"{dept}事業部の人員（{emp_count}名）が最低必要人数（{min_counts[dept]}名）を下回っています！"
                })

            ability_value = sum(e["contributions"][dept] for e in emps)

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
                "shortage_penalty": calculate_shortage_penalty(dept, fulfillment_rate),
                "excess_penalty": calculate_excess_penalty(fulfillment_rate),
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

        # 手動調整結果の希望合致率の計算
        pref_match = calculate_preference_match(assignment, all_employees_list)

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
                "preferenceMatch": pref_match,
            },
            "meta": {
                "alerts": alerts,
                "preferredMatchCount": pref_match["firstChoiceMatchCount"],
                "preferredMatchRate": pref_match["matchRate"],
            }
        }

    except Exception as e:
        print(f"再計算エラー詳細: {str(e)}")
        raise HTTPException(
            status_code=400,
            detail=f"配置再計算エラー: {str(e)}",
        )


# ==================================================
# ④ 目標売上（target_sales）による全シナリオ再最適化
# ==================================================
@app.post("/api/scenarios/reoptimize")
async def reoptimize_with_target(request: Request):
    try:
        raw_body = await request.json()
        employees_raw = raw_body.get("employees", [])

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
                "preferred_dept": str(e.get("preferred_dept") or e.get("desiredDepartment") or ""),
            }
            emp_dict["contributions"] = calculate_all_contributions(emp_dict)
            employees.append(emp_dict)

        employees = enrich_employees_with_preferences(employees)

        loop = asyncio.get_running_loop()

        task1 = loop.run_in_executor(executor, optimize_dynamic_adoption, employees, 58.0, "total_sales")
        task2 = loop.run_in_executor(executor, optimize_dynamic_adoption, employees, 58.0, "a_profit")
        task3 = loop.run_in_executor(executor, optimize_dynamic_adoption, employees, 58.0, "b_sales")
        task4 = loop.run_in_executor(executor, optimize_dynamic_adoption, employees, 58.0, "c_sales")

        res1, res2, res3, res4 = await asyncio.gather(task1, task2, task3, task4)

        if res1 is None: res1 = optimize_total_sales(employees)
        if res2 is None: res2 = optimize_a_profit(employees)
        if res3 is None: res3 = optimize_b_sales(employees)
        if res4 is None: res4 = optimize_c_sales(employees)

        return {
            "scenarios": [
                build_scenario_result(1, "シナリオ1：全社売上最大化", "全社売上", "全社売上", res1, employees),
                build_scenario_result(2, "シナリオ2：A事業部利益最大化", "A利益", "A事業部利益", res2, employees),
                build_scenario_result(3, "シナリオ3：B事業部売上最大化", "B売上", "B事業部売上", res3, employees),
                build_scenario_result(4, "シナリオ4：C事業部売上最大化", "C売上", "C事業部売上", res4, employees),
            ]
        }
    except Exception as e:
        print(f"目標再最適化エラー: {str(e)}")
        raise HTTPException(status_code=400, detail=f"再最適化エラー: {str(e)}")


# ==================================================
# ⑤ 必要人材の目安
# ==================================================
@app.post("/api/scenarios/adoption-threshold")
async def adoption_threshold(request: Request):
    try:
        raw_body = await request.json()
        baseline_scenarios_raw = raw_body.get("baseline_scenarios", [])
        target_sales = float(raw_body.get("target_sales", 58.0))

        baseline_scenarios = []
        for s in baseline_scenarios_raw:
            depts = s.get("departments", {})
            baseline_scenarios.append({
                "id": int(s.get("id")),
                "mode": str(s.get("mode")),
                "totalSales": float(s.get("totalSales", 0.0)),
                "totalProfit": float(s.get("totalProfit", 0.0)),
                "departments": {
                    dept: {
                        "count": int(depts.get(dept, {}).get("count", 0)),
                        "ability": float(depts.get(dept, {}).get("ability", 0.0)),
                        "sales": float(depts.get(dept, {}).get("sales", 0.0)),
                    }
                    for dept in ["A", "B", "C"]
                },
            })

        table = compute_adoption_threshold_table(baseline_scenarios, target_sales)

        return table

    except Exception as e:
        print(f"必要人材シミュレーションエラー: {str(e)}")
        raise HTTPException(status_code=400, detail=f"必要人材シミュレーションエラー: {str(e)}")
