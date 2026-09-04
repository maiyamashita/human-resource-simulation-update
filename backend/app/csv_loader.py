#これは共通部分です。書き換え不可！
#このファイル名はbackend/app/csv_loader.pyです。

import csv
from pathlib import Path


def load_employees(file_path: str) -> list[dict]:
    """
    社員CSVを読み込み、社員データのリストを返す。

    入力値の範囲:
        ・営業力: 0〜100
        ・管理力: 0〜100
        ・開拓力: 0〜100
        ・育成力: 0〜100
        ・人件費: 1〜20
    """

    path = Path(file_path)

    if not path.exists():
        raise FileNotFoundError(
            f"CSVファイルが見つかりません: {path}"
        )

    employees = []

    with path.open(
        "r",
        encoding="utf-8-sig",
        newline=""
    ) as file:

        reader = csv.DictReader(file)

        for row_number, row in enumerate(reader, start=2):

            try:
                sales = int(row["営業力"])
                management = int(row["管理力"])
                development = int(row["開拓力"])
                training = int(row["育成力"])
                personnel_cost = float(row["人件費"])

            except (ValueError, TypeError) as e:
                raise ValueError(
                    f"{row_number}行目の数値データが不正です。"
                ) from e

            # ==========================================
            # 入力値の範囲チェック
            # ==========================================

            if not 0 <= sales <= 100:
                raise ValueError(
                    f"{row_number}行目の営業力が範囲外です: "
                    f"{sales}（0〜100）"
                )

            if not 0 <= management <= 100:
                raise ValueError(
                    f"{row_number}行目の管理力が範囲外です: "
                    f"{management}（0〜100）"
                )

            if not 0 <= development <= 100:
                raise ValueError(
                    f"{row_number}行目の開拓力が範囲外です: "
                    f"{development}（0〜100）"
                )

            if not 0 <= training <= 100:
                raise ValueError(
                    f"{row_number}行目の育成力が範囲外です: "
                    f"{training}（0〜100）"
                )

            if not 1 <= personnel_cost <= 20:
                raise ValueError(
                    f"{row_number}行目の人件費が範囲外です: "
                    f"{personnel_cost}（1〜20）"
                )

            employee = {
                "employee_id": row["社員番号"],
                "sales": sales,
                "management": management,
                "development": development,
                "training": training,
                "personnel_cost": personnel_cost,
            }

            employees.append(employee)

    return employees