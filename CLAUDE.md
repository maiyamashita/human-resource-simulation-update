# CLAUDE.md

このファイルは、このプロジェクトを別のClaude Codeセッションが引き継ぐための引き継ぎ資料です。
記載内容は実際のコードを確認した上で書かれています（推測は含みません）。

## 1. プロジェクトの目的

社員100名（および追加採用時101〜110名）を A/B/C の3事業部に配置するシミュレーションアプリ。
以下の4つの最適化シナリオを、Google OR-Tools（CP-SAT）で解く。

1. 全社売上最大化
2. A事業部利益最大化
3. B事業部売上最大化
4. C事業部売上最大化

共通制約：
- 全社売上は58億円を超える
- A事業部：最低30名、B事業部：最低20名、C事業部：最低10名（100名時の基準）
- 全社員をA/B/Cのいずれか1つに配置
- 社員の能力4項目（営業力・管理力・開拓力・育成力）と人件費を使用
- 事業部ごとの評価重み・基準売上・成長係数・適正人数・ペナルティは仕様どおり使用
- 利益 = 売上 − 人件費×3

追加機能（実装状況は6章参照）：100名→101〜110名の追加採用シミュレーション、手動配置変更後の再計算、従業員希望との一致確認、配置理由の表示、中長期予測。

## 2. バックエンド／フロントエンド構成

### バックエンド（`backend/`、FastAPI + Google OR-Tools CP-SAT）

```
backend/
├── main.py                      # 共通モデルの動作確認用CLIスクリプト（API未使用）
├── api/simulation.py            # FastAPIエントリーポイント（app = FastAPI()）
├── app/
│   ├── csv_loader.py            # CSV読込・バリデーション（書き換え不可）
│   ├── contribution.py          # 貢献度（評価重み）計算（書き換え不可）
│   ├── department_calculator.py # 事業部設定・ペナルティ・売上計算（書き換え不可）
│   ├── common_optimizer.py      # 100名固定シナリオ用の共通最適化モデル
│   ├── dynamic_optimizer.py     # 追加採用・再最適化用の動的最適化モデル（本番のOptimizer）
│   ├── optimizer.py             # 未使用の旧実装（どこからもimportされていない）
│   └── feasibility_checker.py   # 未使用のユーティリティ（どこからもimportされていない）
├── scenarios/scenario1〜4.py    # common_optimizer.pyを使う4シナリオ（/api/scenarios専用）
├── tests/                       # pytest形式ではなく、手動実行想定の検証スクリプト群
└── human_resources_100.csv      # サンプル100名データ
```

依存パッケージは `requirements.txt` 等の管理ファイルがなく、`backend/.venv` に直接インストールされている（fastapi, ortools, uvicorn, pydantic）。

### フロントエンド（`src/app/`、Angular 22、standalone components）

- `app.ts` / `app.html`：CSV読込→バックエンドAPI呼び出し→結果表示を統括するルートコンポーネント。
- `services/scenario-data.service.ts`：`/api/scenarios`, `/api/scenarios/with-adoption`, `/api/scenarios/recalculate`, `/api/scenarios/reoptimize` の4エンドポイントを呼び出す。
- `services/employee-data.service.ts`：CSVをブラウザ側でも解析（表示用）。
- `components/`：`adoption-control`（追加採用人数UI）、`allocation`（配置表示）、`charts`（中長期予測グラフ）、`scenario-comparison`、`scenario-detail`（配置理由表示）、`summary`、`header` など。
- `constants/simulation.constants.ts`：100名時の固定値（`APPROPRIATE_COUNTS`, `MINIMUM_COUNTS` など）。
- `proxy.conf.json`：`/api/**` を `http://127.0.0.1:8000`（バックエンド）にプロキシ。

## 3. Pythonが計算の中心であること

**最適化計算（配置決定・売上・利益・ペナルティの算出）はすべてPython側（`backend/`）で行われる。** Angular側はCSVのパース・表示・グラフ化・UI操作のみを担い、実際の数理最適化（CP-SATモデルの構築・求解）は一切行わない。フロントエンドが独自に「最適解」を計算することはなく、常にバックエンドAPIの結果を表示するだけである。

例外的にフロントエンドが値を計算している箇所：
- `app.ts` の `updateDynamicCounts()`：追加採用モードでの適正人数・最低人数の表示用計算（`dynamic_optimizer.py` の `calculate_dynamic_settings()` と同じロジックをUI表示のためだけにTypeScriptで再実装している。最適化計算そのものではない）。
- `components/charts/charts.ts` の中長期予測：現在のシナリオ結果に成長率を複利適用するだけの表示用の簡易計算（再配置・再最適化は行わない）。

## 4. 各ファイルの役割

### `common_optimizer.py`

`scenarios/scenario1〜4.py`（＝`/api/scenarios`、初回CSVアップロード・100名固定想定）が使う共通のCP-SATモデルビルダー。

- `build_common_model(employees)`：社員配置Bool変数、各事業部の最低人数制約（`department_calculator.DEPARTMENT_SETTINGS` の**固定値**：A30/B20/C10）、事業部能力値、人数別ペナルティ、基本売上・最終売上、人件費、事業部利益・全社利益、全社売上58億円超の制約を構築する。シナリオ固有の目的関数はここでは設定しない。
- 人数別ペナルティは、`AddElement`（配列参照制約）を使って `count[department] - minimum` を添字にペナルティ値を1回で引く実装になっている（後述5章）。
- `create_solver()`：`max_time_in_seconds=3.0`、`num_search_workers=1`、`random_seed=42`、`relative_gap_limit=0.005`。
- `get_assignment_result()`：Solverの結果から事業部ごとの配置社員ID一覧を取り出す。

### `scenario1.py` 〜 `scenario4.py`

いずれも `common_optimizer.build_common_model()` で共通モデルを構築し、シナリオ固有の目的関数だけを設定して解く薄いラッパー。

- `scenario1.py`：`model.Maximize(total_sales)`（全社売上最大化）
- `scenario2.py`：`model.Maximize(profit["A"])`（A事業部利益最大化）
- `scenario3.py`：`model.Maximize(final_sales["B"])`（B事業部売上最大化）
- `scenario4.py`：`model.Maximize(final_sales["C"])`（C事業部売上最大化）

`/api/scenarios`（初回アップロード時）から呼ばれる。100名を前提とした固定基準（`DEPARTMENT_SETTINGS`）で計算される。

### `main.py`

**現在の役割：CLIでの動作確認用スクリプトのみ。** `human_resources_100.csv` を読み込み、`common_optimizer.build_common_model()` で共通制約を満たす実行可能解を求め（目的関数は設定しない）、事業部ごとの配置人数・能力値・売上・利益をコンソールに出力する。**FastAPI経由では一度も呼ばれない**（他のどのファイルからも `main.py` はimportされていない）。冒頭コメントに「共通部分に特化しています」とある通り、共通モデルの検証専用。

### `api/simulation.py`

**現在の役割：本アプリの実際のFastAPIエントリーポイント（`app = FastAPI()`）。** 4つのエンドポイントを持つ。

1. `POST /api/scenarios`：初回CSVアップロード用。`scenarios/scenario1〜4.py`（＝`common_optimizer.py`、100名固定基準）を呼ぶ。
2. `POST /api/scenarios/with-adoption`：追加採用モード用。CSV＋候補者データを受け取り、`dynamic_optimizer.optimize_dynamic_adoption()` を4モード分並列実行（`ThreadPoolExecutor`）する。
3. `POST /api/scenarios/recalculate`：手動配置変更（What-if）時のリアルタイム再計算用。CP-SATのOptimizerは使わず、送信された社員の実際の総人数から `dynamic_optimizer.calculate_dynamic_settings(N)` で適正人数・最低人数を都度算出し、`department_calculator.calculate_shortage_penalty` / `calculate_excess_penalty` / `calculate_sales` に通して売上・利益・充足率を試算する。101〜110名等の特別扱い（if分岐）は存在しない。
4. `POST /api/scenarios/reoptimize`：目標売上（`target_sales`）変更時に4シナリオを再最適化するエンドポイント。`dynamic_optimizer.optimize_dynamic_adoption()` を使用し、失敗時は `scenarios/scenario1〜4.py` にフォールバックする。

### `dynamic_optimizer.py`

**役割：追加採用（101〜110名）・目標再最適化用の本番Optimizer。** `/api/scenarios/with-adoption` と `/api/scenarios/reoptimize` の実体。

- `calculate_dynamic_settings(total_employees)`：100名時の適正人数比率（A:B:C = 40:35:25 = 0.40:0.35:0.25）を基準に、任意の総社員数Nに対して適正人数を「floor＋最大剰余方式（Hamilton方式）」で按分し、最低人数は「100名時の最低人数÷適正人数の比率（A:30/40, B:20/35, C:10/25）」を維持して算出する。N=100では厳密にA40/B35/C25・最低30/20/10と一致することを確認済み。**この関数自体は変更禁止**（6章参照）。
- `optimize_dynamic_adoption(employees, target_sales_billion, mode, use_penalty)`：`calculate_dynamic_settings()` の結果を使ってCP-SATモデルを構築し、`mode`（`total_sales`/`a_profit`/`b_sales`/`c_sales`）に応じた目的関数で解く。人数別ペナルティは `common_optimizer.py` と同様に`AddElement`で表現されている（5章）。Solver設定は `random_seed=42`, `num_search_workers=1`, `max_time_in_seconds=30.0`。

### `feasibility_checker.py`

**現在の使用状況：未使用（デッドコード）。** `check_current_assignment()` という、既存配置の58億円達成可否を確認する関数を持つが、どのファイルからもimportされていない。

### `optimizer.py`

**現在の使用状況：未使用（デッドコード）。** `common_optimizer.py` 登場前の旧実装（A事業部貢献度最大化のみ、人数別ペナルティはBool変数方式のまま）。どこからもimportされていない。

## 5. 現在までに行った共通モデル化（AddElement化）の内容

`common_optimizer.py` と `dynamic_optimizer.py` の人数別ペナルティ表現を、以下のように変更済み。

- **変更前**：人数（例：A事業部なら30〜100名の71通り）ごとにBool変数を1個作り、`AddMultiplicationEquality` で「選択された人数の場合だけ基本売上を有効化」する方式。実際に取り得るペナルティ値は5〜7種類しかないのに、変数・制約を人数分（71〜91個）重複生成していた。
- **変更後**：`count[department] - minimum` を添字とする1個の `IntVar` と、`AddElement(index, values_table, penalty_var)`（配列参照制約）1回に置き換え。`penalty_value`（事業部×人数→ペナルティ値のPython定数表）自体は `main.py` 等との互換のためそのまま維持。
- 効果（実測）：モデルの変数数1,035→318、制約数602→122（約70〜80%減）。シナリオ1（全社売上最大化）は旧モデルで3秒実行時にFEASIBLE止まり・実行毎に結果がブレていたが、新モデルでは3秒未満でOPTIMAL・真の最適値と完全一致・完全に決定論的になった。
- **`dynamic_optimizer.py`側で同時に修正したバグ**：AddElement化前の `dynamic_optimizer.py` は、人数別ペナルティ値を計算してはいたが、最終売上の計算式（`実験：basic_sales × selected だけをモデル化` というコメントが残っていた箇所）で一度もそのペナルティを使っておらず、`use_penalty=True` でも実質ペナルティが売上に反映されていなかった。AddElement化と同時にこのバグを修正し、`common_optimizer.py` と同じ「基本売上×ペナルティ÷100」を正しく適用するようにした（ユーザー承認済みの修正）。
- Solver設定を `num_search_workers=8`（seed未固定）から `num_search_workers=1`, `random_seed=42` に変更し、再現性を優先する方針にした（`common_optimizer.create_solver()`）。`dynamic_optimizer.py` 側は元から `random_seed=42`, `num_search_workers=1`, `max_time_in_seconds=30.0` だったため変更なし。
- `common_optimizer.py` と `dynamic_optimizer.py` の**間**のロジック共通化（重複コードの一本化）は今回は意図的に行っていない。両ファイルは依然として別々の実装。

検証済み事項：N=100〜110・4モードの全44パターンで、配置人数・最低人数遵守・`department_calculator.py`の手計算との完全一致・58億円制約の充足・2回実行での完全な再現性を確認済み。

## 6. 現在判明している問題

- **`num_search_workers=1` 固定下では、C事業部（一部B事業部）を目的とするケースで「証明付きOPTIMAL」に届かないことがある。** 具体的には、`common_optimizer.py`のシナリオ4（C事業部売上最大化）は3秒枠を使い切っても`FEASIBLE`のまま（真の最適値の99.6%相当、11.5535億円 vs 真の最適値11.597億円）。`dynamic_optimizer.py`側でもN=100,106,110のc_sales/b_sales等で30秒枠を使い切って`FEASIBLE`止まりになるケースがある。値自体は毎回完全に決定論的で`department_calculator.py`とも一致しており、計算結果に誤りはないが、CP-SATの下界証明（bound）が単一ワーカーでは0.5%ガードに収まらないため。並列ワーカー数を増やせば数百ms〜数秒で証明付きOPTIMALになることは検証済みだが、再現性を優先して`num_search_workers=1`を基本方針としているため、この trade-off は未解消。
- API（`api/simulation.py`）は現在、Solverの実際のステータス（OPTIMAL/FEASIBLE）や最適性ギャップをレスポンスに含めていない。フロントエンドには「最大化された結果」としてしか見えず、上記の証明未了ケースをユーザーに伝える手段がない。
- `common_optimizer.py`（100名固定・`/api/scenarios`用）と`dynamic_optimizer.py`（可変N・`/api/scenarios/with-adoption`・`reoptimize`用）は、Solverの呼び出し元によって適用される適正人数・最低人数のルールが異なる（前者は`DEPARTMENT_SETTINGS`固定値、後者は`calculate_dynamic_settings(N)`による動的値）。N=100では両者が完全に一致することを確認済みだが、モデル構築ロジック自体は重複したまま個別に保守されている。

## 7. 今後調査・修正する予定の内容

- Solverステータス（OPTIMAL/FEASIBLE）と最適性ギャップをAPIレスポンスに含め、フロントエンドで「確定した最大値」と「時間内で見つかった暫定解」を区別して表示できるようにするかどうかの検討。
- C事業部（およびB事業部の一部ケース）で証明付きOPTIMALに到達しない残課題への対応方針の検討（時間延長／ワーカー数調整／モデル構造のさらなる整理など、正確性・再現性・速度のバランスを踏まえた判断が必要）。
- `common_optimizer.py`と`dynamic_optimizer.py`間のモデル構築ロジックの共通化（今回は意図的にスコープ外とした）。
- 未実装として確認済みの機能：従業員希望との一致確認（フロントエンドに型だけあり、CSVにも希望列がなく、バックエンドの計算箇所も存在しない）、配置理由の表示（`scenario-detail.ts`の`strategyReason`は集計値から組み立てる簡易な文言でCP-SATの制約・目的関数に基づく説明ではない）、中長期予測（`charts.ts`は成長率を複利適用するだけの表示用計算で、将来年度の再配置・再最適化は行っていない）。
- `optimizer.py`・`feasibility_checker.py`（いずれも未使用のデッドコード）の扱いをどうするか（削除するか残すか）の判断。

## 8. 絶対に勝手に変更してはいけない仕様・方針

- **`department_calculator.py`・`contribution.py`・`csv_loader.py` は書き換え禁止**（各ファイル冒頭に「これは共通部分です。書き換え不可！」と明記されている）。事業部の評価重み、基準売上（A10/B7/C2億円）、成長係数（A0.06/B0.12/C0.25）、100名時の適正人数（A40/B35/C25）・最低人数（A30/B20/C10）、不足・過剰ペナルティの数値表、CSV入力値のバリデーション範囲は、いずれもこれらのファイルに定義された値を唯一の基準とする。
- **`dynamic_optimizer.py`の`calculate_dynamic_settings()`自体のロジックは変更禁止**（ユーザーの明示指示）。これは課題仕様に明記のない101〜110名時の適正人数について、「100名時の比率を基準に動的按分する」という製品カタログ上の追加仮説として意図的に採用されているものであり、単純な「仕様違反」として書き換えてはならない。
- 追加採用は1〜10名（101〜110名）のすべてに対応する必要があり、**特定の人数（例：110名）だけをif分岐等で特別扱いする実装は禁止**。常に`calculate_dynamic_settings(N)`など、Nを引数とする汎用ロジックを使うこと。
- 利益＝売上−人件費×3、全社売上58億円超、A/B/Cいずれか1つに全社員を配置、という共通制約は変更しない。
- Solverの`random_seed=42`・`num_search_workers=1`は、再現性を優先するという今回のセッションでの明示的な方針決定であり、これを無断で元の`num_search_workers=8`・seed未固定に戻さないこと。
- コミット時、Claude/Anthropic名義（例：`Claude <noreply@anthropic.com>`）でコミットしないこと（組織方針）。
