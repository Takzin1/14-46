# 出典・クレジット一覧（14:46 — 高台へ）

## 1. 史実・避難の原則の出典（公的資料）

ゲーム内の「史実と創作・出典」画面と振り返り画面には、以下の資料をもとにした要約を載せています。
本文の引用ではなく要約です。正確な内容は必ず原典で確認してください。

| キー | 発行元 | 資料名 | URL | 使った箇所 |
|---|---|---|---|---|
| jma-2011 | 気象庁 | 災害時地震・津波速報 平成23年（2011年）東北地方太平洋沖地震 | https://www.jma.go.jp/jma/kishou/books/saigaiji/saigaiji_201101/saigaiji_201101_07.pdf | 発生日時（2011年3月11日14時46分）、M9.0、14時49分の津波警報（大津波）発表 |
| jma-improve | 気象庁（大阪管区気象台） | 津波警報の改善（ひとくち解説） | https://www.data.jma.go.jp/osaka/jishinkazan/hitokuchi/225_ImproveTsunamiInfo_202402.pdf | 第1報の地震規模・津波の高さの予想が実際を大きく下回ったこと、当時の名称「津波警報（大津波）」 |
| jma-bosai | 気象庁 | 津波から身を守るために | https://www.jma.go.jp/jma/kishou/know/jishin/tsunami_bosai/index.html | 揺れを感じたら警報を待たずに避難、「より遠く」より「より高く」、警報・注意報解除まで戻らない |
| jma-faq | 気象庁 | 津波について（よくある質問集） | https://www.jma.go.jp/jma/kishou/know/faq/faq26.html | 「津波の前には必ず潮が引く」とは限らない |
| jma-generation | 気象庁 | 津波発生と伝播のしくみ | https://www.jma.go.jp/jma/kishou/know/jishin/tsunami/generation.html | 津波は浅い所でも人が走って逃げ切れる速さではない |
| cao-tsunami | 内閣府（防災担当） | 特集 津波について知ろう（広報誌「ぼうさい」） | https://www.bousai.go.jp/kohou/kouhoubousai/h22/05/special_01.html | 海岸近くでも短距離選手並みの速さ、原則徒歩避難 |
| sendai-jishin | 仙台市 | 地震・津波への備え（地震） | https://www.city.sendai.jp/gensaisuishin/kurashi/anzen/saigaitaisaku/jishintsunami/jishin.html | 屋外ではブロック塀・門柱・自動販売機から離れ、カバン等で頭を守る |

> 確認方法についての注記：2026-11-03 時点で、Web検索の結果（各ページの見出しと抜粋）から記載内容を確認しました。
> この作業環境からは `www.city.sendai.jp` と `www.kantei.go.jp` に直接アクセスできなかったため、仙台市ページの正式な
> ページ題名は未確認です（上の題名は内容に基づく仮の表記）。公開前に全URLを人の目で再確認してください。
> 防災の専門家・自治体担当者による内容の検証は**まだ受けていません**。

## 2. 史実とゲーム上の創作の区別

| 区分 | 内容 |
|---|---|
| 史実（出典あり） | 2011年3月11日14時46分の発生、M9.0、気象庁による14時49分の津波警報（大津波）発表 |
| 創作 | 町「潮凪町」、地形、建物、人物（店主・釣り人・近所の人）、町内放送の文面、揺れの長さ（32秒に短縮）、時計の進み（6倍速表示）、津波の到達時刻・速さ・高さ、ハザードマップ、標識の文面と距離 |
| 演出用の簡易モデル | 津波の浸水表現（一定速度で前進する前線と水位の上昇。科学的な浸水シミュレーションではない） |

## 3. 3D素材・画像・音

| 素材 | 作者・入手元 | ライセンス |
|---|---|---|
| キャラクターモデル `public/models/character.glb` | 本プロジェクトでオリジナル作成（`scripts/build-assets.mjs` で three.js の基本形状から生成） | 本プロジェクトに帰属 |
| 車両モデル `public/models/car.glb` | 同上（オリジナル） | 本プロジェクトに帰属 |
| 町・地形・建物・避難ビル・防潮堤・樹木 | 実行時に three.js で生成するオリジナル形状 | 本プロジェクトに帰属 |
| 避難標識・海抜表示・看板の絵柄 | Canvasで描いたゲーム用の簡略オリジナルデザイン。JIS Z 8210 の図記号の複製ではありません（実際の標識は自治体の設置物を確認してください） | 本プロジェクトに帰属 |
| 効果音（揺れ・落下音・足音・波・UI音） | Web Audio API による実行時合成。サイレン・警報音・緊急地震速報の報知音・防災行政無線のチャイムを模した音は使っていません | 本プロジェクトに帰属 |
| 動画の音 | FFmpeg の `anoisesrc` で合成したノイズ（環境音・揺れの低音） | 本プロジェクトに帰属 |
| 動画テロップ用フォント | IPAゴシック（`fonts-ipafont-gothic`） | IPAフォントライセンス v1.0 |

## 4. ソフトウェア

| ライブラリ | 用途 | ライセンス |
|---|---|---|
| three.js 0.170 | 3D描画、GLTFLoader / GLTFExporter | MIT |
| @dimforge/rapier3d-compat 0.14 | 物理・キャラクター衝突判定（KinematicCharacterController）、カメラのレイキャスト | Apache-2.0 |
| Vite 6 / TypeScript 5 | ビルド | MIT / Apache-2.0 |
| Playwright 1.63 | ブラウザ操作テスト・実プレイ画面のキャプチャ | Apache-2.0 |
| FFmpeg 6.1 | 動画編集（libx264 / AAC） | LGPL/GPL（システムのFFmpegを使用。配布物には含めない） |
