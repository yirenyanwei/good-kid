// packages/subject-zh/pages/dictate/index.ts —— 默写页（生字/词语共用）
// 流程（用户定稿）：
//   1. 出题（genQuiz，含错题加权）
//   2. 逐词播报：第 1 遍正常语速 + 2s → 第 2 遍慢速 + 8s 倒计时 → 下一词
//   3. 播完 TTS 播「听写结束，请检查」+ 30 秒补写倒计时（可跳过）
//   4. 对答案：一次性全网格（顺序=报词顺序），家长点卡勾错，可反复切换
//   5. 「n 个全对，直接入库」快捷键（勾了错题即淡出）
//   6. 提交 → 结果页
import { api } from '../../../../utils/cloud-api'
import { speak, wait, Speed } from '../../../../utils/tts'
import { setDictateDraft, clearWrongDraft } from '../../../../utils/storage'
import { GenQuizParams, Quiz, Question, ZhStyle } from '../../../../utils/types'

const GAP_FIRST_TO_SECOND = 2000 // 第 1 遍后停 2 秒
const GAP_BETWEEN_WORDS = 8000 // 词间 8 秒
const CHECK_COUNTDOWN = 30 // 补写倒计时 30 秒

type Phase = 'loading' | 'dictating' | 'finished-reading' | 'checking'

Page({
  data: {
    phase: 'loading' as Phase,
    style: 'hanzi-dictate' as ZhStyle,
    isWordMode: false,
    speed: 'normal' as Speed,
    // 报词状态
    index: 0,
    total: 0,
    passLabel: '第 1 遍',
    paused: false,
    // 补写倒计时
    checkCountdown: CHECK_COUNTDOWN,
    // 对答案
    questions: [] as Question[],
    marked: [] as boolean[], // true = 勾错
    wrongMarked: 0,
  },

  quiz: null as Quiz | null,
  timer: null as ReturnType<typeof setInterval> | null,
  countdownTimer: null as ReturnType<typeof setInterval> | null,
  cancelled: false,

  onLoad(query: Record<string, string | undefined>) {
    const style = (query.style || 'hanzi-dictate') as ZhStyle
    const speed = (query.speed as Speed) || 'normal'
    const mode = (query.mode as 'random' | 'unit') || 'random'
    const p: GenQuizParams = {
      subject: 'zh',
      style,
      grade: Number(query.grade || 3),
      volume: '上',
      mode,
      unit: query.unit ? Number(query.unit) : undefined,
      count: Math.min(Number(query.count || 10), 15),
    }
    this.setData({ style, speed, isWordMode: style === 'word-dictate' })
    this.startQuiz(p)
  },

  async startQuiz(p: GenQuizParams) {
    try {
      const quiz = await api.genQuiz(p)
      if (quiz.questions.length === 0) {
        wx.showToast({ title: '暂无可练词条', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 800)
        return
      }
      this.quiz = quiz
      setDictateDraft(quiz.quizId, 'zh')
      this.setData({
        questions: quiz.questions,
        marked: quiz.questions.map(() => false),
        total: quiz.questions.length,
        phase: 'dictating',
        index: 0,
      })
      this.readNext(0)
    } catch (e) {
      console.error('[dictate] genQuiz 失败', e)
      wx.showToast({ title: '出题失败，请重试', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 800)
    }
  },

  /** 递归：播报第 idx 个词（报两遍） */
  async readNext(idx: number) {
    if (this.cancelled || this.data.paused) return
    if (idx >= this.data.total) {
      this.finishReading()
      return
    }
    this.setData({ index: idx, passLabel: '第 1 遍' })
    const q = this.data.questions[idx]
    const text = q.extra.speakText || q.answer
    try {
      // 第 1 遍：正常语速
      await speak(text, this.data.speed)
      await wait(GAP_FIRST_TO_SECOND)
      if (this.cancelled || this.data.paused) return
      // 第 2 遍：慢速
      this.setData({ passLabel: '第 2 遍（慢）' })
      await speak(text, 'slow')
    } catch (e) {
      console.warn('[dictate] 播报失败，跳过语音等待', e)
    }
    // 8 秒词间倒计时（暂停可中断）
    let waited = 0
    while (waited < GAP_BETWEEN_WORDS && !this.cancelled) {
      await wait(500)
      if (!this.data.paused) waited += 500
    }
    this.readNext(idx + 1)
  },

  /** 全部报完：TTS「听写结束」+ 30 秒补写倒计时 */
  async finishReading() {
    this.setData({ phase: 'finished-reading', passLabel: '' })
    try {
      await speak('听写结束，请检查', this.data.speed)
    } catch {
      /* 静默 */
    }
    this.setData({ phase: 'checking', checkCountdown: CHECK_COUNTDOWN })
    this.countdownTimer = setInterval(() => {
      if (this.cancelled) return
      const next = this.data.checkCountdown - 1
      if (next <= 0) {
        this.clearTimers()
        this.setData({ checkCountdown: 0 })
      } else {
        this.setData({ checkCountdown: next })
      }
    }, 1000)
  },

  skipCountdown() {
    this.clearTimers()
    this.setData({ checkCountdown: 0 })
  },

  togglePause() {
    this.setData({ paused: !this.data.paused })
    if (!this.data.paused && this.data.phase === 'dictating') {
      // 恢复：从当前词重新报起
      this.readNext(this.data.index)
    }
  },

  replayCurrent() {
    const q = this.data.questions[this.data.index]
    if (!q) return
    speak(q.extra.speakText || q.answer, this.data.speed).catch(() => {})
  },

  replayPrev() {
    if (this.data.index === 0) {
      wx.showToast({ title: '已是第一个', icon: 'none' })
      return
    }
    this.readNext(this.data.index - 1)
  },

  // ---- 对答案：点卡勾错（可反复切换） ----
  toggleMark(e: WechatMiniprogram.TouchEvent) {
    const i = e.currentTarget.dataset.i as number
    const marked = [...this.data.marked]
    marked[i] = !marked[i]
    this.setData({ marked, wrongMarked: marked.filter(Boolean).length })
  },

  /** 全对快捷键 */
  markAllCorrect() {
    this.setData({
      marked: this.data.questions.map(() => false),
      wrongMarked: 0,
    })
    this.submit()
  },

  async submit() {
    if (!this.quiz) return
    // 勾错挽留（P1）：勾了错题才能离开→提交；全对走快捷键
    const answers = this.data.questions.map((q, i) => ({
      qid: q.qid,
      correct: !this.data.marked[i],
    }))
    try {
      wx.showLoading({ title: '入库中', mask: true })
      const summary = await api.submitResult(this.quiz, answers)
      wx.hideLoading()
      clearWrongDraft()
      const qs = [
        `correct=${summary.correct}`,
        `total=${summary.total}`,
        `style=${this.data.style}`,
        `newWrong=${summary.newWrong.length}`,
        `graduated=${summary.graduated.length}`,
      ].join('&')
      wx.redirectTo({ url: `/pages/result/index?${qs}` })
    } catch (e) {
      wx.hideLoading()
      console.error('[dictate] 提交失败', e)
      // 失败时本地兜底重试一次
      wx.showToast({ title: '提交失败，重试中', icon: 'none' })
    }
  },

  onExit() {
    if (this.data.phase === 'dictating') {
      wx.showModal({
        title: '退出听写？',
        content: '报词还没结束，退出后本轮作废',
        confirmText: '继续听写',
        cancelText: '退出',
        confirmColor: '#FF7A1A',
        success: (res) => {
          if (!res.confirm) {
            this.cancelled = true
            this.clearTimers()
            clearWrongDraft()
            wx.navigateBack()
          }
        },
      })
    } else if (this.data.wrongMarked === 0 && this.data.total > 0 && this.data.phase === 'checking') {
      // 勾错挽留弹窗
      wx.showModal({
        title: '不勾错就离开？',
        content: '不勾错的话，这轮错题明天不会重现',
        confirmText: '回去勾错',
        cancelText: '直接退出',
        confirmColor: '#FF7A1A',
        success: (res) => {
          if (!res.confirm) {
            this.cancelled = true
            this.clearTimers()
            clearWrongDraft()
            wx.navigateBack()
          }
        },
      })
    } else {
      this.clearTimers()
      wx.navigateBack()
    }
  },

  clearTimers() {
    if (this.timer) clearInterval(this.timer)
    if (this.countdownTimer) clearInterval(this.countdownTimer)
    this.timer = null
    this.countdownTimer = null
  },

  onUnload() {
    this.cancelled = true
    this.clearTimers()
    clearWrongDraft()
  },

  onHide() {
    // 报词中切后台：自动暂停
    if (this.data.phase === 'dictating') {
      this.setData({ paused: true })
    }
  },
})
