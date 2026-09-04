#このファイル名はbackend/app/persona_definitions.pyです。

# ==================================================
# 「必要人材の目安」機能で使う仮想人材4タイプ
#
# フロントエンド・バックエンドどちらにも重複して定義しないよう、
# ここをバックエンド側の唯一の定義箇所とする。
# APIレスポンスにそのまま含めて返すことで、フロントは
# ラベル・能力値を自前で持たずに表示できる。
# ==================================================

PERSONAS = {
    "sales": {
        "label": "営業型",
        "sales": 80,
        "management": 30,
        "development": 50,
        "training": 30,
        "cost": 9.0,
    },
    "management": {
        "label": "管理型",
        "sales": 20,
        "management": 90,
        "development": 20,
        "training": 50,
        "cost": 8.5,
    },
    "development": {
        "label": "開拓型",
        "sales": 50,
        "management": 20,
        "development": 90,
        "training": 10,
        "cost": 8.3,
    },
    "training": {
        "label": "育成型",
        "sales": 20,
        "management": 50,
        "development": 20,
        "training": 90,
        "cost": 8.4,
    },
}
