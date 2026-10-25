// quiz-engine.ts —— 本地出题引擎（V0 LocalImpl 的核心，含加权抽样与干扰项生成）
// 与云函数 genQuiz 出题逻辑一致；错题权重 ×3；连对 2 次毕业的条目不再入卷

import { HanziItem, Question, GenQuizParams, Quiz, ZhStyle } from './types'
import { HANZI_LIST, WORD_ZH_LIST } from './zh-data'
import { getWrongItems } from './storage'

/** 权重抽样：错题权重 ×3，mastered 条目不选 */
function weightedSample<T>(
  pool: T[],
  count: number,
  refOf: (item: T) => string,
  wrongMap: Map<string, { wrongCount: number; streakRight: number; mastered: boolean }>
): T[] {
  const candidates = pool.filter((it) => {
    const w = wrongMap.get(refOf(it))
    return !w || !w.mastered
  })
  const weight = (it: T): number => {
    const w = wrongMap.get(refOf(it))
    if (!w) return 1
    return 1 + Math.min(w.wrongCount, 5) * 3
  }
  const picked: T[] = []
  const remaining = [...candidates]
  while (picked.length < count && remaining.length > 0) {
    const total = remaining.reduce((s, it) => s + weight(it), 0)
    let r = Math.random() * total
    let idx = 0
    for (; idx < remaining.length; idx++) {
      r -= weight(remaining[idx])
      if (r <= 0) break
    }
    if (idx >= remaining.length) idx = remaining.length - 1
    picked.push(remaining[idx])
    remaining.splice(idx, 1)
  }
  return picked
}

/** 拼音四选一：干扰项优先「相近字」——同音 > 声母同 > 韵母同 > 同单元形近 > 随机 */
function buildOptions(correct: HanziItem, sameQuiz: HanziItem[]): string[] {
  const picks: string[] = []
  const used = new Set<string>([correct.hanzi])

  const push = (h: string) => {
    if (!h || used.has(h) || picks.length >= 3) return
    used.add(h)
    picks.push(h)
  }

  const p = correct.pinyin
  const base = p.slice(0, -1) // 去声调的主体（如 chén -> chen）
  const initial = base.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/)?.[0] || ''
  const final = base.slice(initial.length)

  const others = HANZI_LIST.filter((x) => x.hanzi !== correct.hanzi)
  const rank = (x: HanziItem): number => {
    const xp = x.pinyin
    const xBase = xp.slice(0, -1)
    const xInit = xBase.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/)?.[0] || ''
    const xFinal = xBase.slice(xInit.length)
    if (xp === p) return 0 // 同音同调（最佳干扰）
    if (xBase === base && x.unit === correct.unit) return 1 // 同音异调 + 同单元
    if (xBase === base) return 2 // 同音异调
    if (xInit === initial && xFinal === final) return 3 // 声韵同调异
    if (xFinal === final) return 4 // 韵母同
    if (xInit === initial) return 5 // 声母同
    if (x.unit === correct.unit) return 6 // 同单元（形近/课内常见混淆）
    return 9 // 随机兜底
  }
  // 相近优先，同级内乱序
  const ranked = others
    .map((x) => ({ x, r: rank(x), k: Math.random() }))
    .sort((a, b) => a.r - b.r || a.k - b.k)
  for (const { x } of ranked) {
    push(x.hanzi)
    if (picks.length >= 3) break
  }
  return shuffle([correct.hanzi, ...picks])
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

let quizSeq = 0

/** 生字默写卷 */
function genHanziDictate(p: GenQuizParams, wrongMap: Map<string, any>): Question[] {
  const pool = HANZI_LIST.filter((x) => filterBy(p, x.unit))
  const items = weightedSample(pool, p.count, (x) => x.id, wrongMap)
  return items.map((x) => ({
    qid: `q-${Date.now()}-${quizSeq++}`,
    subject: 'zh' as const,
    type: 'dictate' as const,
    prompt: '',
    answer: x.hanzi,
    extra: {
      itemRef: x.id,
      speakText: x.speakText || x.hanzi,
      pinyin: x.pinyin,
      fromWrong: wrongMap.has(x.id),
    },
  }))
}

/** 词语听写卷（整词，不挖空） */
function genWordDictate(p: GenQuizParams, wrongMap: Map<string, any>): Question[] {
  const pool = WORD_ZH_LIST.filter((x) => filterBy(p, x.unit))
  const items = weightedSample(pool, p.count, (x) => x.id, wrongMap)
  return items.map((x) => ({
    qid: `q-${Date.now()}-${quizSeq++}`,
    subject: 'zh' as const,
    type: 'dictate' as const,
    prompt: '',
    answer: x.word,
    extra: {
      itemRef: x.id,
      speakText: x.word,
      word: x.word,
      pinyin: x.pinyin,
      fromWrong: wrongMap.has(x.id),
    },
  }))
}

/** 看拼音选字卷（四选一，选项乱序） */
function genPinyinChoice(p: GenQuizParams, wrongMap: Map<string, any>): Question[] {
  const pool = HANZI_LIST.filter((x) => filterBy(p, x.unit))
  const items = weightedSample(pool, p.count, (x) => x.id, wrongMap)
  return items.map((x) => ({
    qid: `q-${Date.now()}-${quizSeq++}`,
    subject: 'zh' as const,
    type: 'choice' as const,
    prompt: x.pinyin,
    answer: x.hanzi,
    extra: {
      itemRef: x.id,
      speakText: x.hanzi,
      pinyin: x.pinyin,
      options: buildOptions(x, items),
      fromWrong: wrongMap.has(x.id),
    },
  }))
}

function filterBy(p: GenQuizParams, unit: number): boolean {
  if (p.mode === 'unit' && p.unit) return unit === p.unit
  return true
}

/** 本地出题统一入口 */
export async function genQuizLocal(p: GenQuizParams): Promise<Quiz> {
  const wrongs = getWrongItems().filter((w) => w.subject === p.subject)
  const wrongMap = new Map(wrongs.map((w) => [w.itemRef, w]))

  let questions: Question[]
  const style: ZhStyle = p.style || 'hanzi-dictate'
  if (style === 'word-dictate') {
    questions = genWordDictate(p, wrongMap)
  } else if (style === 'pinyin-choice') {
    questions = genPinyinChoice(p, wrongMap)
  } else {
    questions = genHanziDictate(p, wrongMap)
  }
  // 不足 count 按实际数出（错题 3 题起步也生成重练卷）
  return {
    quizId: `quiz-${Date.now()}-${quizSeq++}`,
    subject: p.subject,
    style,
    questions,
  }
}
