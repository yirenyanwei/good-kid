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

/** 拼音四选一：选项从同年级字池中随机取（真实学习混淆项） */
function buildOptions(correct: HanziItem, sameQuiz: HanziItem[]): string[] {
  const opts = new Set<string>()
  // 优先：同池其他字的拼音（真实学习混淆项）
  const others = HANZI_LIST.filter((x) => x.pinyin !== correct.pinyin)
  const shuffled = shuffle(others)
  for (const o of shuffled) {
    if (opts.size >= 3) break
    opts.add(o.hanzi)
  }
  return shuffle([correct.hanzi, ...opts])
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
