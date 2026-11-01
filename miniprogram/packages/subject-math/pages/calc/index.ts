// packages/subject-math/pages/calc/index.ts —— 口算作答页（数字键盘 · 即时判题）
import { api } from '../../../../utils/cloud-api'
import { genMathQuiz } from '../../../../utils/math-engine'
import { GenQuizParams, MathOp, Quiz } from '../../../../utils/types'

type Phase = 'loading' | 'answering' | 'feedback'

const MAX_INPUT = 4 // 三位数封顶（加法最大 100+90=190）

Page({
  data: {
    phase: 'loading' as Phase,
    index: 0,
    total: 0,
    // 当前题
    expression: '',
    input: '',
    answer: '',
    // 反馈
    lastCorrect: false,
    streak: 0,
    results: [] as boolean[],
    quiz: null as Quiz | null,
    // 键盘
    keys: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '清', '0', '⌫'],
  },

  streak: 0,

  onLoad(query: Record<string, string | undefined>) {
    const style = (query.style as string) || 'math-calc'
    const count = Math.min(Number(query.count || 10), 50)
    const ops = (query.ops || '').split(',').filter(Boolean) as MathOp[]
    const p: GenQuizParams = {
      subject: 'math',
      style: style as GenQuizParams['style'],
      grade: 3,
      volume: '上',
      mode: 'random',
      count,
      ops: ops.length > 0 ? ops : undefined,
    }
    this.start(p)
  },

  async start(p: GenQuizParams) {
    let quiz: Quiz | null = null
    try {
      quiz = await api.genQuiz(p)
    } catch (e) {
      // 云端不可用：降级本地出题（练习不中断；错题本本地暂存）
      console.warn('[calc] 云端出题失败，降级本地', e)
      quiz = genMathQuiz(p)
    }
    if (!quiz || quiz.questions.length === 0) {
      wx.showToast({ title: '出题失败，请重试', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
      return
    }
    this.setData({
      quiz,
      total: quiz.questions.length,
      results: quiz.questions.map(() => false),
      phase: 'answering',
    })
    this.showQuestion(0)
  },

  showQuestion(i: number) {
    const quiz = this.data.quiz as Quiz
    const q = quiz.questions[i]
    this.setData({
      index: i,
      expression: q.prompt,
      answer: q.answer,
      input: '',
    })
  },

  // ---- 数字键盘 ----
  onKey(e: WechatMiniprogram.TouchEvent) {
    if (this.data.phase !== 'answering') return
    const k = e.currentTarget.dataset.k as string
    if (k === '清') {
      this.setData({ input: '' })
      return
    }
    if (k === '⌫') {
      this.setData({ input: this.data.input.slice(0, -1) })
      return
    }
    if (this.data.input.length >= MAX_INPUT) return
    // 去前导零：输入 0 后再输数字 → 替换
    let input = this.data.input
    if (input === '0') input = ''
    this.setData({ input: input + k })
  },

  submit() {
    if (this.data.phase !== 'answering') return
    if (this.data.input === '') {
      wx.showToast({ title: '先输入答案', icon: 'none' })
      return
    }
    const correct = this.data.input === this.data.answer
    const results = [...this.data.results]
    results[this.data.index] = correct
    this.streak = correct ? this.streak + 1 : 0
    this.setData({
      phase: 'feedback',
      lastCorrect: correct,
      results,
      streak: this.streak,
    })
    setTimeout(() => this.next(), correct ? 500 : 1200)
  },

  next() {
    const nextIdx = this.data.index + 1
    if (nextIdx >= this.data.total) {
      this.finish()
    } else {
      this.setData({ phase: 'answering' })
      this.showQuestion(nextIdx)
    }
  },

  async finish() {
    const quiz = this.data.quiz
    if (!quiz) return
    const answers = quiz.questions.map((q, i) => ({
      qid: q.qid,
      correct: this.data.results[i],
    }))
    let summary
    try {
      summary = await api.submitResult(quiz, answers)
    } catch (e) {
      // 提交链路彻底失败：仍要出结果页（本轮成绩不丢，仅错题本未更新）
      console.error('[calc] submitResult 失败，直接结算', e)
      summary = {
        total: answers.length,
        correct: answers.filter((a) => a.correct).length,
        newWrong: [],
        graduated: [],
      }
    }
    const qs = [
      `correct=${summary.correct}`,
      `total=${summary.total}`,
      `style=${quiz.style || 'math-calc'}`,
      `newWrong=${summary.newWrong.length}`,
      `graduated=${summary.graduated.length}`,
    ].join('&')
    wx.redirectTo({ url: `/pages/result/index?${qs}` })
  },

  onExit() {
    wx.showModal({
      title: '退出练习？',
      content: '本轮进度将作废',
      confirmText: '继续练习',
      cancelText: '退出',
      confirmColor: '#FF7A1A',
      success: (res) => {
        if (!res.confirm) wx.navigateBack()
      },
    })
  },
})
