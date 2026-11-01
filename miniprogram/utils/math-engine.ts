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
 * 混合运算两位算式：形如 1+2×3 / 100÷5−6。
 * 结构 = a ± (b×c) 或 a ± (d÷e)，加减在前、乘除在后（先算乘除）。
 * 保证：除法整除、最终结果非负整数。
 */
function genMixedQuestion(): { text: string; answer: number } {
  for (let attempt = 0; attempt < 50; attempt++) {
    // 二级部分（先算）：乘法 b×c，或除法 dividend÷e（整除）
    let second: number // 二级部分的值
    let secondText: string
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
    // 一级部分（后算）：a ± second，减法保证非负
    const isAdd = Math.random() < 0.5
    const a = isAdd ? ri(1, 30) : ri(second, second + 30)
    const result = isAdd ? a + second : a - second
    if (result < 0 || !Number.isInteger(result)) continue
    return {
      text: `${a} ${isAdd ? '+' : '−'} ${secondText}`,
      answer: result,
    }
  }
  return { text: `3 + 2 × 4`, answer: 11 } // 兜底（理论到不了）
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
