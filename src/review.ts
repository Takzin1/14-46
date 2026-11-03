// Builds the post-game "判断の振り返り". No points or scores — the review explains decisions.

export interface DecisionLog {
  strongTime: number;
  protectTime: number;
  hazardClose: string[];
  tileNear: number;
  tileNearProtected: number;
  evacStartDelay: number | null; // seconds after shaking stopped until the player moved away
  seaVisit: boolean;
  car: boolean;
  alley: boolean;
  called: string[];
  destination: 'hill' | 'building' | null;
  arrivalEvacT: number | null;
  margin: number | null; // seconds between reaching safety and the water overtopping the seawall
  higher: boolean;
  leftSafe: boolean;
  returnChoice: 'stay' | 'return' | null;
  failed: boolean;
  timeline: { clock: string; text: string }[];
}

export function newLog(): DecisionLog {
  return {
    strongTime: 0, protectTime: 0, hazardClose: [], tileNear: 0, tileNearProtected: 0,
    evacStartDelay: null, seaVisit: false, car: false, alley: false, called: [],
    destination: null, arrivalEvacT: null, margin: null, higher: false, leftSafe: false,
    returnChoice: null, failed: false, timeline: [],
  };
}

export type Mark = 'good' | 'mid' | 'bad' | 'info';
export interface ReviewItem { mark: Mark; title: string; body: string; source?: string }

export function buildReview(log: DecisionLog): { outcome: string; items: ReviewItem[] } {
  const items: ReviewItem[] = [];
  const ratio = log.strongTime > 0 ? log.protectTime / log.strongTime : 0;
  const close = log.hazardClose.length > 0;
  items.push({
    mark: ratio >= 0.5 && !close ? 'good' : ratio >= 0.2 || !close ? 'mid' : 'bad',
    title: `揺れている間の行動：身を守った時間 約${Math.round(ratio * 100)}%` + (close ? `／${log.hazardClose.join('・')}の近くにいた` : ''),
    body: '揺れている間は無理に動かず、頭を守りましょう。屋外では自動販売機・看板・ブロック塀・電柱など、倒れたり落ちたりしやすい物から離れることが大切です。',
    source: 'sendai-jishin',
  });
  if (log.tileNear > 0) {
    items.push({
      mark: log.tileNearProtected >= log.tileNear ? 'mid' : 'bad',
      title: `落下物が近くに落ちた：${log.tileNear}回（頭を守っていた：${log.tileNearProtected}回）`,
      body: '建物の近くでは瓦やガラス、看板が落ちてくることがあります。建物から離れ、カバンなどで頭を守りましょう。',
      source: 'sendai-jishin',
    });
  }
  if (log.evacStartDelay !== null) {
    const d = log.evacStartDelay;
    items.push({
      mark: d <= 10 ? 'good' : d <= 25 ? 'mid' : 'bad',
      title: `揺れがおさまってから避難を始めるまで：約${Math.round(d)}秒（ゲーム内）`,
      body: '強い揺れや長い揺れを感じたら、警報を待たずに、すぐに海岸から離れて高い場所へ避難します。',
      source: 'jma-bosai',
    });
  } else {
    items.push({ mark: 'bad', title: '避難を始められなかった', body: '揺れがおさまったら、すぐに高い場所へ向かいましょう。', source: 'jma-bosai' });
  }
  items.push(
    log.seaVisit
      ? { mark: 'bad', title: '海の様子を見に行った', body: '海が静かに見えても、津波が来ないとは限りません。「津波の前には必ず潮が引く」とも限りません。海を見に行かず、すぐに高い場所へ。', source: 'jma-faq' }
      : { mark: 'good', title: '海の様子を見に行かなかった', body: '津波は見えてからでは間に合いません。海の様子を確かめに行かない判断は大切です。', source: 'jma-generation' },
  );
  items.push(
    log.car
      ? { mark: 'bad', title: '車で避難しようとした（渋滞で動けなくなった）', body: '多くの人が車で逃げると渋滞が起き、動けなくなるおそれがあります。地域のルールがない限り、原則は徒歩で避難します。', source: 'cao-tsunami' }
      : { mark: 'good', title: '徒歩で避難した', body: '原則として徒歩で避難します（地域で決められたルールがある場合はそれに従います）。', source: 'cao-tsunami' },
  );
  if (log.alley) {
    items.push({ mark: 'mid', title: '近道が倒れた電柱でふさがれていた', body: '地震の後は、ふだん使える道が通れないことがあります。日頃からハザードマップで避難場所と複数の経路を確認しておきましょう。' });
  }
  if (log.called.length) {
    items.push({ mark: 'good', title: `周りの人に避難を呼びかけた（${log.called.join('・')}）`, body: '周囲への声かけは、他の人の避難のきっかけになります。ただし、そのために自分の避難が遅れないよう注意が必要です。' });
  } else {
    items.push({ mark: 'info', title: '周りの人への呼びかけ', body: '近くの人に「逃げよう」と声をかけることは、避難のきっかけになります（自分の避難を遅らせない範囲で）。' });
  }
  if (log.destination) {
    const where = log.destination === 'hill' ? '高台（潮凪台公園）' : '津波避難ビル（潮凪町民センター）の屋上';
    items.push({
      mark: 'good',
      title: `避難先：${where}`,
      body: log.destination === 'hill'
        ? '高い場所へ避難できました。「ここなら安心」と思わず、さらに高い場所があれば移動しましょう。'
        : '高台が遠いときは、津波避難ビルなども選択肢になります。できるだけ高い階へ。',
      source: 'jma-bosai',
    });
    items.push(
      log.higher
        ? { mark: 'good', title: 'さらに高い場所（潮凪神社）へ移動した', body: '「より遠く」より「より高く」。余裕があれば、さらに高い場所を目指します。', source: 'jma-bosai' }
        : { mark: 'info', title: 'さらに高い場所への移動', body: '避難場所に着いた後も、より高い場所があれば移動を考えましょう。', source: 'jma-bosai' },
    );
  }
  if (log.leftSafe) {
    items.push({ mark: 'bad', title: '安全な場所から一度離れた', body: '津波は繰り返し襲ってきます。警報・注意報が解除されるまで、低い場所や海岸付近に戻らないでください。', source: 'jma-bosai' });
  }
  if (log.returnChoice) {
    items.push(
      log.returnChoice === 'stay'
        ? { mark: 'good', title: '水が引いても戻らなかった', body: '第一波が最大とは限りません。警報・注意報が解除されるまで安全な場所にとどまります。', source: 'jma-bosai' }
        : { mark: 'bad', title: '水が引いたので家に戻ろうとした', body: '津波は繰り返し襲ってきて、後の波の方が大きいこともあります。警報・注意報が解除されるまで戻らないでください。', source: 'jma-bosai' },
    );
  }

  let outcome: string;
  if (log.failed) outcome = '避難が間に合いませんでした。どこで時間がかかったかを振り返り、もう一度挑戦してみましょう。';
  else if (log.margin !== null) outcome = `安全な高さに到達しました。浸水が始まる約${Math.max(0, Math.round(log.margin))}秒前（ゲーム内）でした。` + (log.margin < 20 ? ' 余裕はほとんどありませんでした。' : '');
  else outcome = '振り返り';
  return { outcome, items };
}
