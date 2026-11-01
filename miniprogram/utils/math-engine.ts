// math-engine.ts —— 数学出题引擎（三年级上册难度）
// 两种样式：
//   math-calc  单步口算：加/减/乘/除 可单选可多选
//   math-mixed 混合运算：两位算式 a±b×c / a×b±c / a÷b±c / a±b÷c（先乘除后加减）
// 约束：结果非负整数；除法保证整除；数字范围贴合三上（表内乘除、百以内加减）
// 错题加权：算式字符串做 itemRef（同一算式错 N 次权重升高，重练时优先出）

import { Question, GenQuizParams, Quiz, MathOp } from './types'
import { getWrongItems } from './storage'

/** 三年级上册数字范围 */
const RANGE = {
  add: { a: [2, 98], b: [2, 98] }, // 和 ≤ 100
  sub: { a: [20, 100], b: [2, 60] }, // 差非负
  mul: { a: [2, 9], b: [2, 9] }, // 表内乘法
  div: { a: [2, 9], b: [2, 9] }, // 表内除法（a×b ÷ a 形态）
}

const OP_SYM: Record<MathOp, string> = { add: '+', sub: '−', mul: '×', div: '÷' }

function ri(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function apply(op: MathOp, a: number, b: number): number {
  if (op === 'add') return a + b
  if (op === 'sub') return a - b
  if (op === 'mul') return a * b
  return a / b
}

/** 单步口算题：按勾选的运算符集合生成 */
function genCalcQuestion(ops: MathOp[]): { text: string; answer: number } {
  const op = pick(ops)
  let a: number, b: number
  if (op === 'div') {
    // 保证整除：先想乘积再拆
    a = ri(RANGE.div.a[0], RANGE.div.a[1])
    b = ri(RANGE.div.b[0], RANGE.div.b[1])
    const product = a * b
    return { text: `${product} ÷ ${a}`, answer: b }
  }
  const [aMin, aMax] = RANGE[op].a
  const [bMin, bMax] = RANGE[op].b
  a = ri(aMin, aMax)
  b = ri(bMin, bMax)
  if (op === 'sub' && b > a) [a, b] = [b, a] // 差非负
  return { text: `${a} ${OP_SYM[op]} ${b}`, answer: apply(op, a, b) }
}

/**
 * 混合运算两位算式，四种形态轮换（普通三形态 + 括号形态）：
 *   ① a ± b×c   ② a ± d÷e   ③ d÷e ± f   ④ 带括号（genParenQuestion）
 * 保证：除法整除、最终结果非负整数。
 */
function genMixedQuestion(): { text: string; answer: number } {
  const kind = Math.floor(Math.random() * 4)
  if (kind === 3) return genParenQuestion()
  for (let attempt = 0; attempt < 50; attempt++) {
    let text: string
    let answer: number
    if (kind === 0) {
      // ① a ± b×c（先乘后加减）
      const b = ri(2, 9)
      const c = ri(2, 9)
      const second = b * c
      const isAdd = Math.random() < 0.5
      const a = isAdd ? ri(1, 30) : ri(second, second + 30)
      text = `${a} ${isAdd ? '+' : '−'} ${b} × ${c}`
      answer = isAdd ? a + second : a - second
    } else if (kind === 1) {
      // ② a ± d÷e（先除后加减）
      const e = ri(2, 9)
      const q = ri(2, 9)
      const isAdd = Math.random() < 0.5
      const a = isAdd ? ri(1, 30) : ri(q, q + 30)
      text = `${a} ${isAdd ? '+' : '−'} ${e * q} ÷ ${e}`
      answer = isAdd ? a + q : a - q
    } else {
      // ③ d÷e ± f（除在前）
      const e = ri(2, 9)
      const q = ri(2, 9)
      const isAdd = Math.random() < 0.5
      const f = isAdd ? ri(1, 30) : Math.min(ri(1, 30), Math.max(q - 1, 1))
      text = `${e * q} ÷ ${e} ${isAdd ? '+' : '−'} ${f}`
      answer = isAdd ? q + f : q - f
    }
    if (answer < 0 || !Number.isInteger(answer)) continue
    return { text, answer }
  }
  return { text: `3 + 2 × 4`, answer: 11 } // 兜底（理论到不了）
}

/** 括号题：(a−b)×c / (a−b)÷c / d÷(a−b)，括号内减法，保证整除与非负 */
function genParenQuestion(): { text: string; answer: number } {
  for (let attempt = 0; attempt < 50; attempt++) {
    const form = Math.floor(Math.random() * 3)
    if (form === 0) {
      // (a−b)×c：括号结果 2-9，乘 c 表内
      const inner = ri(2, 9) // 括号值
      const b = ri(2, Math.max(inner - 1, 1))
      const a = inner + b
      const c = ri(2, 9)
      return { text: `(${a} − ${b}) × ${c}`, answer: inner * c }
    }
    if (form === 1) {
      // (a−b)÷c：括号值 = c 的 2-9 倍
      const c = ri(2, 9)
      const k = ri(2, 9)
      const inner = c * k
      const b = ri(2, Math.max(inner - 2, 2))
      const a = inner + b
      return { text: `(${a} − ${b}) ÷ ${c}`, answer: k }
    }
    // d÷(a−b)：被除数是括号值的 2-9 倍
    const ab = ri(2, 9) // 括号值
    const k = ri(2, 9)
    const d = ab * k
    const b = ri(2, Math.max(ab - 1, 1))
    const a = ab + b
    return { text: `${d} ÷ (${a} − ${b})`, answer: k }
  }
  return { text: `(10 − 4) × 3`, answer: 18 } // 兜底（理论到不了）
}

/** 错题权重：同算式文本的错题条目存在 → 该题重新入卷概率提高（×3 权重） */
function buildQuestions(p: GenQuizParams, make: () => { text: string; answer: number }): Question[] {
  const wrongs = getWrongItems().filter((w) => w.subject === 'math')
  const wrongSet = new Set(wrongs.filter((w) => !w.mastered).map((w) => w.itemRef))

  const questions: Question[] = []
  const seen = new Set<string>()
  const target = p.count
  let guard = 0
  while (questions.length < target && guard < target * 40) {
    guard++
    const { text, answer } = make()
    if (seen.has(text)) continue // 同卷不重复
    seen.add(text)
    const ref = `math-${text.replace(/\s/g, '')}` // 锚点：去空格算式本身
    questions.push({
      qid: `q-math-${Date.now()}-${questions.length}`,
      subject: 'math',
      type: 'input',
      prompt: text,
      answer: String(answer),
      extra: {
        itemRef: ref,
        fromWrong: wrongSet.has(ref),
      },
    })
  }
  return questions
}

/** 数学出题统一入口 */
export function genMathQuiz(p: GenQuizParams): Quiz {
  const style = (p.style as string) || 'math-calc'
  let questions: Question[]
  if (style === 'math-mixed') {
    questions = buildQuestions(p, genMixedQuestion)
  } else {
    const ops: MathOp[] = p.ops && p.ops.length > 0 ? p.ops : ['add']
    questions = buildQuestions(p, () => genCalcQuestion(ops))
  }
  return {
    quizId: `quiz-math-${Date.now()}`,
    subject: 'math',
    style: style as Quiz['style'],
    questions,
  }
}
