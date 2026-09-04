#これは共通部分です。書き換え不可！
#このファイル名はbackend/app/contribution.pyです。

# 各事業部の評価重み
WEIGHTS = {
    "A": {
        "sales": 0.45,
        "management": 0.35,
        "development": 0.10,
        "training": 0.10,
    },
    "B": {
        "sales": 0.35,
        "management": 0.20,
        "development": 0.30,
        "training": 0.15,
    },
    "C": {
        "sales": 0.20,
        "management": 0.10,
        "development": 0.50,
        "training": 0.20,
    },
}


def calculate_contribution(employee: dict, weights: dict) -> float:
    """
    1人の社員について、指定された事業部の貢献度を計算する。
    """

    return (
        employee["sales"] * weights["sales"]
        + employee["management"] * weights["management"]
        + employee["development"] * weights["development"]
        + employee["training"] * weights["training"]
    )


def calculate_all_contributions(employee: dict) -> dict:
    """
    1人の社員について、A・B・Cすべての貢献度を計算する。
    """

    return {
        "A": calculate_contribution(employee, WEIGHTS["A"]),
        "B": calculate_contribution(employee, WEIGHTS["B"]),
        "C": calculate_contribution(employee, WEIGHTS["C"]),
    }