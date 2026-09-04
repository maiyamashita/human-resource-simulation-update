#これは共通部分です。書き換え不可！
#このファイル名はbackend/app/department_calculator.pyです。


# ==================================================
# 各事業部の設定
# ==================================================

DEPARTMENT_SETTINGS = {
    "A": {
        "name": "A事業部",
        "appropriate_count": 40,
        "minimum_count": 30,
    },
    "B": {
        "name": "B事業部",
        "appropriate_count": 35,
        "minimum_count": 20,
    },
    "C": {
        "name": "C事業部",
        "appropriate_count": 25,
        "minimum_count": 10,
    },
}


# ==================================================
# 基準売上（億円）
# ==================================================

BASE_SALES = {
    "A": 10,
    "B": 7,
    "C": 2,
}


# ==================================================
# 成長係数
# ==================================================

GROWTH_RATE = {
    "A": 0.06,
    "B": 0.12,
    "C": 0.25,
}


# ==================================================
# 事業部状態計算
# ==================================================

def calculate_department_status(department, employees):
    """
    1つの事業部について、

    ・配置人数
    ・事業部能力値
    ・充足率
    ・不足ペナルティ
    ・過剰ペナルティ

    を計算する。
    """

    settings = DEPARTMENT_SETTINGS[department]

    employee_count = len(employees)

    # 事業部能力値
    ability_value = sum(
        employee["contributions"][department]
        for employee in employees
    )

    # 充足率
    fulfillment_rate = (
        employee_count
        / settings["appropriate_count"]
    )

    # 不足ペナルティ
    shortage_penalty = calculate_shortage_penalty(
        department,
        fulfillment_rate,
    )

    # 過剰ペナルティ
    excess_penalty = calculate_excess_penalty(
        fulfillment_rate,
    )

    return {
        "department": department,
        "name": settings["name"],
        "employee_count": employee_count,
        "ability_value": ability_value,
        "fulfillment_rate": fulfillment_rate,
        "shortage_penalty": shortage_penalty,
        "excess_penalty": excess_penalty,
    }


# ==================================================
# 人員不足ペナルティ
# ==================================================

def calculate_shortage_penalty(
    department,
    fulfillment_rate,
):
    """
    充足率に応じた人員不足ペナルティを返す。

    課題仕様:
        A:
            100%以上  1.00
            90%以上   0.85
            80%以上   0.70
            70%以上   0.50
            70%未満   0.30

        B:
            100%以上  1.00
            90%以上   0.90
            80%以上   0.80
            70%以上   0.65
            70%未満   0.50

        C:
            100%以上  1.00
            90%以上   0.95
            80%以上   0.90
            70%以上   0.80
            70%未満   0.70
    """

    rate = fulfillment_rate * 100

    if department == "A":

        if rate >= 100:
            return 1.00
        elif rate >= 90:
            return 0.85
        elif rate >= 80:
            return 0.70
        elif rate >= 70:
            return 0.50
        else:
            return 0.30

    if department == "B":

        if rate >= 100:
            return 1.00
        elif rate >= 90:
            return 0.90
        elif rate >= 80:
            return 0.80
        elif rate >= 70:
            return 0.65
        else:
            return 0.50

    if department == "C":

        if rate >= 100:
            return 1.00
        elif rate >= 90:
            return 0.95
        elif rate >= 80:
            return 0.90
        elif rate >= 70:
            return 0.80
        else:
            return 0.70

    raise ValueError(
        f"未知の事業部です: {department}"
    )


# ==================================================
# 人員過剰ペナルティ
# ==================================================

def calculate_excess_penalty(fulfillment_rate):
    """
    充足率に応じた人員過剰ペナルティを返す。

    課題仕様:
        120%以下       1.00
        120%超〜140%以下 0.95
        140%超〜160%以下 0.90
        160%超          0.80
    """

    rate = fulfillment_rate * 100

    if rate <= 120:
        return 1.00
    elif rate <= 140:
        return 0.95
    elif rate <= 160:
        return 0.90
    else:
        return 0.80


# ==================================================
# 売上計算
# ==================================================

def calculate_sales(department_result):
    """
    事業部の計算結果から、

    ・基本売上
    ・適用補正係数
    ・最終売上

    を計算する。

    売上単位：億円
    """

    department = department_result["department"]

    ability_value = department_result["ability_value"]

    shortage_penalty = (
        department_result["shortage_penalty"]
    )

    excess_penalty = (
        department_result["excess_penalty"]
    )

    # ----------------------------------------------
    # 基準売上
    # ----------------------------------------------

    base_sales = BASE_SALES[department]

    # ----------------------------------------------
    # 成長係数
    # ----------------------------------------------

    growth_rate = GROWTH_RATE[department]

    # ----------------------------------------------
    # 基本売上
    #
    # 基準売上 ×
    # (1 + (事業部能力値 / 100) × 成長係数)
    # ----------------------------------------------

    calculated_sales = base_sales * (
        1
        + (ability_value / 100)
        * growth_rate
    )

    # ----------------------------------------------
    # 適用する補正係数
    #
    # 100%未満 → 不足ペナルティ
    # 100%以上 → 過剰ペナルティ
    #
    # 100%ちょうどは1.00
    # ----------------------------------------------

    if department_result["fulfillment_rate"] < 1:
        penalty = shortage_penalty
    else:
        penalty = excess_penalty

    # ----------------------------------------------
    # 最終売上
    # ----------------------------------------------

    final_sales = calculated_sales * penalty

    return {
        "base_sales": base_sales,
        "growth_rate": growth_rate,
        "calculated_sales": calculated_sales,
        "penalty": penalty,
        "final_sales": final_sales,
    }