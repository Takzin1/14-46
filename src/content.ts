// All player-facing text lives here so that facts, fiction and guidance are easy to audit.

export const TITLE = '14:46 — 高台へ';
export const TOWN = '潮凪町（しおなぎちょう）';

/** 確認できる史実（出典つき）。ゲーム内の創作とは明確に分けて表示する。 */
export const HISTORICAL_FACTS: { text: string; source: string }[] = [
  {
    text: '2011年3月11日14時46分、三陸沖を震源とする「平成23年（2011年）東北地方太平洋沖地震」が発生。気象庁はマグニチュードを9.0としている（国内観測史上最大）。',
    source: 'jma-2011',
  },
  {
    text: '気象庁は地震発生から約3分後の14時49分、岩手県・宮城県・福島県に津波警報（大津波）を発表した（当時の名称。現在の「大津波警報」に相当）。',
    source: 'jma-2011',
  },
  {
    text: '津波警報の第1報で発表した地震の規模や津波の高さの予想は、実際を大きく下回るものだったと気象庁は振り返っている。',
    source: 'jma-improve',
  },
];

/** ゲーム内の創作であることの明示 */
export const FICTION_NOTES: string[] = [
  `舞台の${TOWN}は架空の町です。実在の地名・地形・建物・人物を再現したものではありません。`,
  '登場人物はすべて架空です。実際の被災者や犠牲者をモデルにしていません。',
  'ゲーム内の時刻表示は短縮されています。揺れの長さ、警報のタイミング、津波の到達時間はゲーム用に作ったもので、実際の地震とは一致しません。',
  '津波の表現は演出用の簡易モデルであり、科学的な浸水シミュレーションではありません。',
  'ゲーム内の放送は架空のもので、実在の防災行政無線・緊急地震速報・警報音を模していません。',
];

/** 避難の原則（公的資料に基づく要約。出典キーは SOURCES を参照） */
export const PRINCIPLES: { title: string; body: string; source: string }[] = [
  {
    title: '揺れを感じたら、警報を待たずに避難',
    body: '強い揺れや、弱くても長い時間ゆっくりとした揺れを感じたら、津波警報の発表を待たずに、すぐに海岸から離れて安全な場所へ避難する。',
    source: 'jma-bosai',
  },
  {
    title: '津波は「見てから」では間に合わない',
    body: '津波は陸上でも人が走って逃げ切れる速さではない。津波が見えなくても、海が静かに見えても、速やかに避難する。',
    source: 'jma-generation',
  },
  {
    title: '「引き潮」がなくても津波は来る',
    body: '「津波の前には必ず潮が引く」とは限らない。潮が引かずに、いきなり大きな波が押し寄せることがある。',
    source: 'jma-faq',
  },
  {
    title: '「より遠く」より「より高く」',
    body: 'ここなら安心と思わず、より高い場所を目指す。高台が遠いときは津波避難ビルなども選択肢になる。',
    source: 'jma-bosai',
  },
  {
    title: '警報・注意報が解除されるまで戻らない',
    body: '津波は繰り返し襲ってくる。第一波が最大とは限らない。警報・注意報が出ている間は海岸付近に戻らない。',
    source: 'jma-bosai',
  },
  {
    title: '揺れている間は、まず身の安全',
    body: '揺れている間は無理に動かず、頭を守る。屋外ではブロック塀・自動販売機・看板・電柱など倒れたり落ちたりしやすい物から離れる。',
    source: 'sendai-jishin',
  },
  {
    title: '避難は原則徒歩で',
    body: '車での避難は渋滞などで動けなくなるおそれがある。地域で決められたルールがない限り、原則として徒歩で避難する。',
    source: 'cao-tsunami',
  },
];

export const SOURCES: Record<string, { org: string; title: string; url: string }> = {
  'jma-2011': {
    org: '気象庁',
    title: '災害時地震・津波速報 平成23年（2011年）東北地方太平洋沖地震',
    url: 'https://www.jma.go.jp/jma/kishou/books/saigaiji/saigaiji_201101/saigaiji_201101_07.pdf',
  },
  'jma-improve': {
    org: '気象庁',
    title: '津波警報の改善（東北地方太平洋沖地震を踏まえて）',
    url: 'https://www.data.jma.go.jp/osaka/jishinkazan/hitokuchi/225_ImproveTsunamiInfo_202402.pdf',
  },
  'jma-bosai': {
    org: '気象庁',
    title: '津波から身を守るために',
    url: 'https://www.jma.go.jp/jma/kishou/know/jishin/tsunami_bosai/index.html',
  },
  'jma-faq': {
    org: '気象庁',
    title: '津波について（よくある質問集）',
    url: 'https://www.jma.go.jp/jma/kishou/know/faq/faq26.html',
  },
  'jma-generation': {
    org: '気象庁',
    title: '津波発生と伝播のしくみ',
    url: 'https://www.jma.go.jp/jma/kishou/know/jishin/tsunami/generation.html',
  },
  'cao-tsunami': {
    org: '内閣府（防災担当）',
    title: '特集 津波について知ろう（広報誌「ぼうさい」）',
    url: 'https://www.bousai.go.jp/kohou/kouhoubousai/h22/05/special_01.html',
  },
  'sendai-jishin': {
    org: '仙台市',
    title: '地震・津波への備え（地震）',
    url: 'https://www.city.sendai.jp/gensaisuishin/kurashi/anzen/saigaitaisaku/jishintsunami/jishin.html',
  },
};

export const CONTENT_NOTICE = [
  '本作は、東日本大震災の教訓をもとにした防災体験ゲームです。',
  '強い揺れ・物の落下・津波の浸水を表す場面があります（人が被害を受ける描写はありません）。',
  '震災を経験された方や、つらい気持ちになる方は、無理をせずいつでも中断してください。',
  '設定の「演出強度」で、揺れ・音・光・水の表現を弱められます。',
];

export const DISCLAIMER = [
  '本作は防災の専門家による検証を受けていません。教育効果や避難シミュレーションの精度を保証するものではありません。',
  '実際の避難は、お住まいの自治体のハザードマップ・避難計画・公的な情報に従ってください。',
];

export const CONTROLS_DESKTOP: [string, string][] = [
  ['W A S D / 矢印', '移動'],
  ['Shift', '走る（押している間）'],
  ['マウス（画面クリックで視点操作）', 'カメラ回転'],
  ['C / Space 長押し', '身を守る（頭を守ってしゃがむ）'],
  ['E', '話す・調べる'],
  ['M', '地図（ハザードマップ）'],
  ['Esc / P', '一時停止・設定'],
];

export const CONTROLS_TOUCH: [string, string][] = [
  ['左下スティック', '移動（大きく倒すと走る）'],
  ['画面右側をドラッグ', 'カメラ回転'],
  ['🛡 ボタン長押し', '身を守る'],
  ['話す ボタン', '話す・調べる'],
  ['地図 ボタン', '地図（ハザードマップ）'],
  ['Ⅱ ボタン', '一時停止・設定'],
];

/** Game-internal fictional broadcast (text only, no siren / no real chime). */
export const BROADCAST =
  '（ゲーム内の架空の町内放送）こちらは潮凪町です。大津波警報が発表されました。海岸付近の方は、ただちに高台へ避難してください。';
