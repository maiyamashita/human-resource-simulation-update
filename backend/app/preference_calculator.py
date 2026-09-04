# backend/app/preference_calculator.py

from typing import Dict, List, Any

DEPARTMENTS = ["A", "B", "C"]

def infer_employee_preferences(employee: Dict[str, Any]) -> Dict[str, str]:
    """
    社員の能力値から潜在的な第一希望〜第三希望を自動推測する。
    - A事業部（飽和/維持）: 管理力 (management) 重視
    - B事業部（成長/拡大）: 営業力 (sales) + 育成力 (training) 重視
    - C事業部（新規/開拓）: 開拓力 (development) 重視
    """
    s_val = float(employee.get("sales", employee.get("sales_ability", 0)))
    m_val = float(employee.get("management", employee.get("management_ability", 0)))
    d_val = float(employee.get("development", employee.get("development_ability", 0)))
    t_val = float(employee.get("training", employee.get("training_ability", 0)))

    score_a = m_val * 1.0
    score_b = (s_val * 0.7) + (t_val * 0.3)
    score_c = d_val * 1.0

    scores = [
        {"dept": "A", "score": score_a},
        {"dept": "B", "score": score_b},
        {"dept": "C", "score": score_c},
    ]

    # スコア降順にソート
    scores.sort(key=lambda x: x["score"], reverse=True)

    return {
        "preferred_dept": scores[0]["dept"],
        "second_preferred_dept": scores[1]["dept"],
        "third_preferred_dept": scores[2]["dept"],
    }


def enrich_employees_with_preferences(employees: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    全社員データに対して希望が未設定の場合、潜在希望を付与する。
    """
    for emp in employees:
        if not emp.get("preferred_dept"):
            prefs = infer_employee_preferences(emp)
            emp.update(prefs)
    return employees


def calculate_preference_match(
    assignment: Dict[str, List[str]], 
    employees: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    シナリオの配置結果 (assignment: {'A': ['E001', ...], ...}) と
    社員の希望を照合し、第一・第二希望一致数および希望合致率(%)を算出する。
    """
    emp_map = {str(e.get("employee_id", e.get("id"))): e for e in employees}
    
    first_match_count = 0
    second_match_count = 0
    total_count = 0

    for dept, emp_ids in assignment.items():
        for emp_id in emp_ids:
            emp = emp_map.get(str(emp_id))
            if not emp:
                continue
            
            total_count += 1
            pref = emp.get("preferred_dept")
            second_pref = emp.get("second_preferred_dept")

            if pref == dept:
                first_match_count += 1
            elif second_pref == dept:
                second_match_count += 1

    if total_count == 0:
        return {
            "firstChoiceMatchCount": 0,
            "secondChoiceMatchCount": 0,
            "matchRate": 0.0,
            "totalCount": 0,
        }

    # 第一希望: 100%, 第二希望: 60% の重み付けで総合合致率スコアを計算
    match_score = (first_match_count * 1.0) + (second_match_count * 0.6)
    match_rate = round((match_score / total_count) * 100.0, 1)

    return {
        "firstChoiceMatchCount": first_match_count,
        "secondChoiceMatchCount": second_match_count,
        "matchRate": match_rate,
        "totalCount": total_count,
    }