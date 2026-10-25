// packages/subject-zh/pages/choice/index.ts —— 看拼音选字（四选一 · 即时判题）
import { api } from '../../../../utils/cloud-api'
import { speak } from '../../../../utils/tts'
import { GenQuizParams, Quiz, Question } from '../../../../utils/types'

type Phase = 'loading' | 'answering' | 'feedback'

Page({
  data: {
    phase: 'loading' as Phase,
    index: 0,
    total: 0,
    // 当前题
    pinyin: '',
    options: [] as string[],
    picked: '',
    answer: '',
    // 反馈
    lastCorrect: false,
    streak: 0,
    // 汇总
    results: [] as boolean[],
    quiz: null as Quiz | null,
  },

  streak: 0,

  onLoad(query: Record<string, string | undefined>) {
    const mode = (query.mode as 'random' | 'unit') || 'random'
    const p: GenQuizParams = {
      subject: 'zh',
      style: 'pinyin-choice',
      grade: 3,
      volume: '上',
      mode,
      unit: query.unit ? Number(query.unit) : undefined,
      count: Math.min(Number(query.count || 10), 20),
    }
    this.start(p)
  },

  async start(p: GenQuizParams) {
    try {
      const quiz = await api.genQuiz(p)
      if (quiz.questions.length === 0) {
        wx.showToast({ title: '暂无可练词条', icon: 'none' })
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
    } catch (e) {
      console.error('[choice] genQuiz 失败', e)
      wx.showToast({ title: '出题失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    }
  },

  showQuestion(i: number) {
    const q = (this.data.quiz as Quiz).questions[i] as Question
    this.setData({
      index: i,
      pinyin: q.prompt,
      options: q.extra.options || [],
      answer: q.answer,
      picked: '',
    })
    // 朗读题目（听发音选字）
    speak(q.prompt, 'normal').catch(() => {})
  },

  pick(e: WechatMiniprogram.TouchEvent) {
    if (this.data.picked) return // 防连点
    const opt = e.currentTarget.dataset.opt as string
    const correct = opt === this.data.answer
    const results = [...this.data.results]
    results[this.data.index] = correct
    this.streak = correct ? this.streak + 1 : 0
    this.setData({
      picked: opt,
      phase: 'feedback',
      lastCorrect: correct,
      results,
      streak: this.streak,
    })
    // 正确时读出该字（强化字音关联）
    if (correct) speak(this.data.answer, 'normal').catch(() => {})
    setTimeout(() => this.next(), correct ? 600 : 1300)
  },

  next() {
    const nextIdx = this.data.index + 1
    if (nextIdx >= this.data.total) {
      this.submit()
    } else {
      this.setData({ phase: 'answering' })
      this.showQuestion(nextIdx)
    }
  },

  async submit() {
    const quiz = this.data.quiz
    if (!quiz) return
    const answers = quiz.questions.map((q, i) => ({
      qid: q.qid,
      correct: this.data.results[i],
    }))
    const summary = await api.submitResult(quiz, answers)
    const qs = [
      `correct=${summary.correct}`,
      `total=${summary.total}`,
      `style=pinyin-choice`,
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
      confirmColor: '#534AB7',
      success: (res) => {
        if (!res.confirm) wx.navigateBack()
      },
    })
  },
})
