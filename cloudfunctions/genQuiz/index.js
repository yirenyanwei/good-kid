// 云函数 genQuiz —— 出题统一入口（与端上 quiz-engine.ts 出题逻辑一致）
// 入参：{ subject:'zh', style, grade, volume, mode:'random'|'unit', unit?, count }
// 出参：{ quizId, subject, style, questions: [{ qid, type, prompt, answer, extra }] }
// 加权：查 db_wrong_book，错题权重 ×3；mastered 条目不入卷

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

const STYLE_TYPE = {
  'hanzi-dictate': 'dictate',
  'word-dictate': 'dictate',
  'pinyin-choice': 'choice',
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// 内置词库（与 miniprogram/utils/zh-data.ts 同源；切云库后改查 db_hanzi/db_word_zh）
const HANZI = require('./data/hanzi.js')
const WORDS = require('./data/word-zh.js')

/** 拼音四选一干扰项：相近字优先（与端上 quiz-engine.ts buildOptions 一致）
 *  分级：同音同调 > 同音异调+同单元 > 同音异调 > 声韵同 > 韵母同 > 声母同 > 同单元 > 随机 */
function buildOptions(correct, pool) {
  const picks = []
  const used = new Set([correct.hanzi])
  const push = (h) => {
    if (!h || used.has(h) || picks.length >= 3) return
    used.add(h)
    picks.push(h)
  }
  const p = correct.pinyin
  const base = p.slice(0, -1)
  const initial = base.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/)?.[0] || ''
  const final = base.slice(initial.length)
  const others = pool.filter((x) => x.hanzi !== correct.hanzi)
  const rank = (x) => {
    const xp = x.pinyin
    const xBase = xp.slice(0, -1)
    const xInit = xBase.match(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/)?.[0] || ''
    const xFinal = xBase.slice(xInit.length)
    if (xp === p) return 0
    if (xBase === base && x.unit === correct.unit) return 1
    if (xBase === base) return 2
    if (xInit === initial && xFinal === final) return 3
    if (xFinal === final) return 4
    if (xInit === initial) return 5
    if (x.unit === correct.unit) return 6
    return 9
  }
  const ranked = others
    .map((x) => ({ x, r: rank(x), k: Math.random() }))
    .sort((a, b) => a.r - b.r || a.k - b.k)
  for (const { x } of ranked) {
    push(x.hanzi)
    if (picks.length >= 3) break
  }
  return shuffle([correct.hanzi, ...picks])
}

/** 报词文本：从 words 随机选一个组词（X——XX的X）；无 words 时兜底单字/旧 speakText */
function pickSpeakText(x) {
  if (x.words && x.words.length > 0) {
    const w = x.words[Math.floor(Math.random() * x.words.length)]
    return x.hanzi + '——' + w + '的' + x.hanzi
  }
  return x.speakText || x.hanzi
}

exports.main = async (event) => {
  const { subject = 'zh', style = 'hanzi-dictate', grade = 3, volume = '上', mode = 'random', unit, count = 10 } = event
  if (subject !== 'zh') {
    return { error: 'math/en 云函数 V1.1/V1.2 提供' }
  }

  // 该用户错题（加权与毕业过滤）
  const { OPENID } = cloud.getWXContext()
  const wrongMap = new Map()
  try {
    const wrongRes = await db
      .collection('db_wrong_book')
      .where({ openid: OPENID, subject, mastered: false })
      .limit(1000)
      .get()
    wrongRes.data.forEach((w) => wrongMap.set(w.itemRef, w))
  } catch (e) {
    console.warn('[genQuiz] 错题本查询失败（首次使用）', e)
  }

  // 词池
  let pool
  if (style === 'word-dictate') {
    pool = WORDS
  } else {
    pool = HANZI
  }
  const unitFilter = mode === 'unit' && unit ? (x) => x.unit === unit : () => true
  const candidates = pool.filter((x) => x.grade === grade && x.volume === volume && unitFilter(x))

  // 权重抽样
  const weight = (item) => {
    const w = wrongMap.get(item.id)
    return w ? 1 + Math.min(w.wrongCount, 5) * 3 : 1
  }
  const picked = []
  const remaining = [...candidates]
  while (picked.length < Math.min(count, remaining.length) && remaining.length > 0) {
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

  // 组题
  const quizId = `quiz-${Date.now()}-${Math.floor(Math.random() * 1e4)}`
  let questions
  if (style === 'pinyin-choice') {
    // 四选一：干扰项从全库同年级字中取，相近字优先（buildOptions）
    const all = HANZI.filter((x) => x.grade === grade && x.volume === volume)
    questions = picked.map((x, i) => {
      return {
        qid: `${quizId}-q${i}`,
        subject: 'zh',
        type: 'choice',
        prompt: x.pinyin,
        answer: x.hanzi,
        extra: {
          itemRef: x.id,
          speakText: x.speakText || x.hanzi,
          pinyin: x.pinyin,
          options: buildOptions(x, all),
        },
      }
    })
  } else if (style === 'word-dictate') {
    questions = picked.map((x, i) => ({
      qid: `${quizId}-q${i}`,
      subject: 'zh',
      type: 'dictate',
      prompt: '',
      answer: x.word,
      extra: {
        itemRef: x.id,
        speakText: x.word,
        word: x.word,
        pinyin: x.pinyin,
      },
    }))
  } else {
    questions = picked.map((x, i) => ({
      qid: `${quizId}-q${i}`,
      subject: 'zh',
      type: 'dictate',
      prompt: '',
      answer: x.hanzi,
      extra: {
        itemRef: x.id,
        speakText: pickSpeakText(x),
        pinyin: x.pinyin,
      },
    }))
  }

  return { quizId, subject, style, questions }
}
