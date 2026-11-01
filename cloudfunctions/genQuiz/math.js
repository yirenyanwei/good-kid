// math.js —— 云端数学出题引擎（与 miniprogram/utils/math-engine.ts 逻辑同构）
// math-calc：口算，加减乘除可单选可多选（ops 数组）
// math-mixed：混合运算 a±b×c / a±d÷e（先乘除后加减）
// 约束：结果非负整数、除法整除、表内乘除/百内加减（三上难度）、同卷去重
// 错题加权：算式去空格文本做 itemRef，与 db_wrong_book 对齐

const RANGE = {
  add: { a: [2, 98], b: [2, 98] }, // 和 ≤ 100
  sub: { a: [20, 100], b: [2, 60] }, // 差非负
  mul: { a: [2, 9], b: [2, 9] }, // 表内乘法
  div: { a: [2, 9], b: [2, 9] }, // 表内除法（a×b ÷ a 形态）
}

const OP_SYM = { add: '+', sub: '−', mul: '×', div: '÷' }

function ri(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** 单步口算题 */
function genCalcQuestion(ops) {
  const op = pick(ops)
  if (op === 'div') {
    // 保证整除：先想乘积再拆
    const a = ri(RANGE.div.a[0], RANGE.div.a[1])
    const b = ri(RANGE.div.b[0], RANGE.div.b[1])
    return { text: `${a * b} ÷ ${a}`, answer: b }
  }
  const [aMin, aMax] = RANGE[op].a
  const [bMin, bMax] = RANGE[op].b
  let a = ri(aMin, aMax)
  let b = ri(bMin, bMax)
  if (op === 'sub' && b > a) [a, b] = [b, a] // 差非负
  const result = op === 'add' ? a + b : op === 'sub' ? a - b : a * b
  return { text: `${a} ${OP_SYM[op]} ${b}`, answer: result }
}

/** 混合运算两位算式：a ± (b×c) 或 a ± (d÷e)，先乘除后加减 */
function genMixedQuestion() {
  for (let attempt = 0; attempt < 50; attempt++) {
    let second // 二级部分的值
    let secondText
    if (Math.random() < 0.5) {
      const b = ri(2, 9)
      const c = ri(2, 9)
      second = b * c
      secondText = `${b} × ${c}`
    } else {
      const e = ri(2, 9)
      const quotient = ri(2, 9) // 商 = 二级部分的值
      second = quotient
      secondText = `${e * quotient} ÷ ${e}`
    }
    const isAdd = Math.random() < 0.5
    const a = isAdd ? ri(1, 30) : ri(second, second + 30)
    const result = isAdd ? a + second : a - second
    if (result < 0 || !Number.isInteger(result)) continue
    return { text: `${a} ${isAdd ? '+' : '−'} ${secondText}`, answer: result }
  }
  return { text: '3 + 2 × 4', answer: 11 } // 兜底（理论到不了）
}

/**
 * 组卷（含错题加权）。
 * wrongMap: Map<itemRef, wrongDoc>（未毕业错题），权重 = 1 + min(wrongCount,5)×3
 * 权重落实方式：先按权重抽错题条目入卷，剩余名额生成新题。
 */
function buildMathQuiz(style, count, ops, wrongMap) {
  const questions = []
  const seen = new Set()
  const quizId = `quiz-math-${Date.now()}-${Math.floor(Math.random() * 1e4)}`

  // 1) 错题优先：按权重抽样（与语文 genQuiz 同算法）
  const wrongItems = []
  for (const [ref, w] of wrongMap) {
    const text = ref.slice('math-'.length).replace(/([+\-×÷])/g, ' $1 ') // ref 反推算式文本
    wrongItems.push({ ref, text, weight: 1 + Math.min(w.wrongCount, 5) * 3 })
  }
  let wrongQuota = Math.min(Math.floor(count / 3), wrongItems.length) // 错题最多占 1/3
  const remainingWrong = [...wrongItems]
  while (questions.length < wrongQuota && remainingWrong.length > 0) {
    const total = remainingWrong.reduce((s, it) => s + it.weight, 0)
    let r = Math.random() * total
    let idx = 0
    for (; idx < remainingWrong.length; idx++) {
      r -= remainingWrong[idx].weight
      if (r <= 0) break
    }
    if (idx >= remainingWrong.length) idx = remainingWrong.length - 1
    const it = remainingWrong[idx]
    remainingWrong.splice(idx, 1)
    if (seen.has(it.text)) continue
    seen.add(it.text)
    // 重算答案（不信任存量字段，ref 本身即真相）
    const answer = evalMathText(it.text)
    if (answer === null) continue
    questions.push({
      qid: `${quizId}-q${questions.length}`,
      subject: 'math',
      type: 'input',
      prompt: it.text,
      answer: String(answer),
      extra: { itemRef: it.ref, fromWrong: true },
    })
  }

  // 2) 新题补足
  let guard = 0
  while (questions.length < count && guard < count * 40) {
    guard++
    const q = style === 'math-mixed' ? genMixedQuestion() : genCalcQuestion(ops)
    if (seen.has(q.text)) continue
    seen.add(q.text)
    const ref = `math-${q.text.replace(/\s/g, '')}`
    questions.push({
      qid: `${quizId}-q${questions.length}`,
      subject: 'math',
      type: 'input',
      prompt: q.text,
      answer: String(q.answer),
      extra: { itemRef: ref, fromWrong: wrongMap.has(ref) },
    })
  }

  return { quizId, subject: 'math', style, questions }
}

/** 算式文本求值（×÷− 转 js 运算符；返回 null 表示无法解析） */
function evalMathText(text) {
  const js = text.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-')
  if (!/^[\d+\-*/().\s]+$/.test(js)) return null
  try {
    const v = Function('return (' + js + ')')()
    return Number.isInteger(v) && v >= 0 ? v : null
  } catch (e) {
    return null
  }
}

module.exports = { buildMathQuiz }
