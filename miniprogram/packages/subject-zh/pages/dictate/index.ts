// packages/subject-zh/pages/dictate/index.ts —— 默写页（生字/词语共用）
// 流程（用户定稿）：
//   1. 出题（genQuiz，含错题加权）
//   2. 逐词播报：第 1 遍正常语速 + 2s → 第 2 遍慢速 + 8s 倒计时 → 下一词
//   3. 播完 TTS 播「听写结束，请检查」+ 30 秒补写倒计时（可跳过）
//   4. 对答案：一次性全网格（顺序=报词顺序），家长点卡勾错，可反复切换
//   5. 「n 个全对，直接入库」快捷键（勾了错题即淡出）
//   6. 提交 → 结果页
import { api } from '../../../../utils/cloud-api'
import { speak, wait, stopAll, Speed } from '../../../../utils/tts'
import { setDictateDraft, clearWrongDraft } from '../../../../utils/storage'
import { GenQuizParams, Quiz, Question, ZhStyle, EnStyle, Subject } from '../../../../utils/types'

const GAP_FIRST_TO_SECOND = 2000 // 第 1 遍后停 2 秒
const GAP_BETWEEN_WORDS = 8000 // 词间 8 秒
const CHECK_COUNTDOWN = 30 // 补写倒计时 30 秒

type Phase = 'loading' | 'dictating' | 'finished-reading' | 'checking'

/** 报词可视文本的分段：{ t: 文本片段, hit: 是否目标字 } */
interface DisplaySeg {
  t: string
  hit: boolean
}

/**
 * 报词可视文本（用户决策 2026-10-25：词语/成语也直接显示汉字，家长会管住孩子不看手机）：
 * - 汉字模式：显示组词并标红目标字（如「直线」，线字红）
 * - 词语模式：直接显示词语本身（拼音作为小字注音展示）
 */
function buildDisplay(q: Question, isWordMode: boolean): DisplaySeg[] {
  if (isWordMode) {
    // 词语听写：整词显示（家长可视，孩子不看手机）
    return [{ t: q.answer || q.extra.word || '', hit: false }]
  }
  const st = q.extra.speakText || ''
  // 提取「——」后的组词部分（如「直线的线」），再去掉尾部的「的字」
  const m = st.split('——')[1] || ''
  const phrase = m.replace(/的.$/, '')
  if (phrase && phrase.includes(q.answer)) {
    const segs: DisplaySeg[] = []
    for (const c of phrase) {
      segs.push({ t: c, hit: c === q.answer })
    }
    return segs
  }
  // 兜底：组词缺失/不含目标字
  return [{ t: q.extra.pinyin || '', hit: false }]
}

Page({
  data: {
    phase: 'loading' as Phase,
    subject: 'zh' as Subject,
    style: 'hanzi-dictate' as ZhStyle | EnStyle,
    isWordMode: false,
    isEn: false,
    speed: 'normal' as Speed,
    // 报词状态
    index: 0,
    total: 0,
    passLabel: '第 1 遍',
    paused: false,
    // 报词同步显示（家长可视）
    display: [] as DisplaySeg[],
    // 词语模式：拼音注音小字
    displayPinyin: '',
    // 补写倒计时
    checkCountdown: CHECK_COUNTDOWN,
    /** 当前词剩余时间占整词的百分比（100 = 刚开始，0 = 该词时间用完） */
    ringPct: 100,
    // 对答案
    questions: [] as Question[],
    marked: [] as boolean[], // true = 勾错
    wrongMarked: 0,
  },

  quiz: null as Quiz | null,
  timer: null as ReturnType<typeof setInterval> | null,
  countdownTimer: null as ReturnType<typeof setInterval> | null,
  speakTick: null as ReturnType<typeof setInterval> | null,
  /** 当前词：已知等待（2s+8s）的剩余与总时长；播报耗时结束后并进总时长，环按剩余/总长收缩 */
  totalMs: GAP_FIRST_TO_SECOND + GAP_BETWEEN_WORDS,
  remainMs: GAP_FIRST_TO_SECOND + GAP_BETWEEN_WORDS,
  cancelled: false,
  /** 报词代际：每次开始新报词链（恢复/上一词）+1，旧链检测到代际不符即自杀，防双链竞态 */
  readGen: 0,

  onLoad(query: Record<string, string | undefined>) {
    const subject: Subject = query.subject === 'en' ? 'en' : 'zh'
    const style = (query.style || (subject === 'en' ? 'word-en-dictate' : 'hanzi-dictate')) as ZhStyle | EnStyle
    const speed = (query.speed as Speed) || 'normal'
    const mode = (query.mode as 'random' | 'unit') || 'random'
    const isEn = subject === 'en' || style === 'word-en-dictate'
    const p: GenQuizParams = {
      subject: isEn ? 'en' : 'zh',
      style,
      grade: Number(query.grade || 3),
      volume: '上',
      mode,
      unit: query.unit ? Number(query.unit) : undefined,
      count: Math.min(Number(query.count || 10), isEn ? 20 : 15),
    }
    this.setData({
      subject: isEn ? 'en' : 'zh',
      style,
      speed,
      isWordMode: style === 'word-dictate' || isEn,
      isEn,
    })
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
      setDictateDraft(quiz.quizId, p.subject)
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

  /** 环：剩余时间 / 本词总时间。extraMs 是正在播、尚未记入 total 的耗时。过期链不许再画，避免切词后把新环覆盖掉 */
  paintRing(extraMs: number, gen: number) {
    if (gen !== this.readGen) return
    const total = this.totalMs + extraMs
    const pct = total > 0 ? Math.round((this.remainMs / total) * 100) : 0
    const clamped = Math.max(0, Math.min(100, pct))
    if (clamped !== this.data.ringPct) this.setData({ ringPct: clamped })
  },

  resetWordClock(gen: number) {
    this.totalMs = GAP_FIRST_TO_SECOND + GAP_BETWEEN_WORDS
    this.remainMs = this.totalMs
    this.paintRing(0, gen)
  },

  /** 播一遍并让环随播报时间收缩。返回 false 表示这条报词链已作废 */
  async trackSpeak(text: string, gen: number): Promise<boolean> {
    const t0 = Date.now()
    // 计时器记在局部：旧链结束时只能清自己的，不能把新词刚装上的计时器清掉
    const tick = setInterval(() => {
      if (this.cancelled || gen !== this.readGen || this.data.paused) return
      this.paintRing(Date.now() - t0, gen)
    }, 100)
    this.speakTick = tick
    try {
      await speak(text, this.data.speed)
    } catch (e) {
      console.warn('[dictate] 播报失败，跳过语音等待', e)
    } finally {
      clearInterval(tick)
      if (this.speakTick === tick) this.speakTick = null
    }
    if (gen !== this.readGen || this.cancelled) return false
    const elapsed = Math.max(0, Date.now() - t0)
    this.totalMs += elapsed
    this.paintRing(0, gen)
    if (!this.data.paused) return true
    // 朗读被暂停打断：环停在当前进度，继续后只重读这一遍，不把整词倒计时清零
    if (!(await this.hold(gen))) return false
    return this.trackSpeak(text, gen)
  },

  /** 暂停时停在原地，直到继续。返回 false 表示这条报词链已作废 */
  async hold(gen: number): Promise<boolean> {
    while (this.data.paused && !this.cancelled && gen === this.readGen) {
      await wait(80)
    }
    return !this.cancelled && gen === this.readGen
  },

  /** 消耗一段已知等待（词间 2s / 写字 8s），暂停时冻结剩余时间 */
  async drain(ms: number, gen: number): Promise<boolean> {
    let left = ms
    while (left > 0 && !this.cancelled) {
      if (gen !== this.readGen) return false
      if (this.data.paused) {
        await wait(100)
        continue
      }
      const step = Math.min(100, left)
      await wait(step)
      if (gen !== this.readGen) return false
      if (this.data.paused) continue
      left -= step
      this.remainMs = Math.max(0, this.remainMs - step)
      this.paintRing(0, gen)
    }
    return !this.cancelled && gen === this.readGen
  },

  /** 递归：播报第 idx 个词（报两遍）。gen = 本次链的代际号 */
  async readNext(idx: number, gen?: number) {
    const g = gen ?? ++this.readGen
    if (this.cancelled || this.data.paused) return
    if (idx >= this.data.total) {
      this.finishReading()
      return
    }
    const q = this.data.questions[idx]
    const text = q.extra.speakText || q.answer
    this.resetWordClock(g)
    this.setData({
      index: idx,
      passLabel: '第 1 遍',
      display: buildDisplay(q, this.data.isWordMode),
      displayPinyin: this.data.isWordMode ? (q.extra.meaning || q.extra.pinyin || '') : '',
    })
    const ok1 = await this.trackSpeak(text, g)
    if (!ok1) return
    if (!(await this.drain(GAP_FIRST_TO_SECOND, g))) return
    // 第 2 遍：同样正常语速（慢速实测更听不清，已弃用）
    this.setData({ passLabel: '第 2 遍' })
    const ok2 = await this.trackSpeak(text, g)
    if (!ok2) return
    // 8 秒写字时间，环在这段走完
    if (!(await this.drain(GAP_BETWEEN_WORDS, g))) return
    this.readNext(idx + 1, g)
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
    if (this.data.phase !== 'dictating') return
    const next = !this.data.paused
    this.setData({ paused: next })
    if (next) {
      // 暂停：停掉正在播的音频。倒计时环停在当前进度，不重新计算
      stopAll()
    }
    // 继续：原来的报词链在 hold/drain 里等着，从剩余时间接着走
  },

  /** 切到另一个词。先解除暂停，再让旧链作废 */
  jumpTo(idx: number) {
    if (this.data.phase !== 'dictating') return
    if (idx < 0) {
      wx.showToast({ title: '已是第一个', icon: 'none' })
      return
    }
    // 先作废旧链并拆掉它的计时器，再停音频。否则旧链收尾会清掉新词的进度环，
    // 新词朗读期间环停在半路，播完才一次性跳一截
    this.readGen++
    if (this.speakTick) {
      clearInterval(this.speakTick)
      this.speakTick = null
    }
    this.setData({ paused: false, ringPct: 100 })
    this.totalMs = GAP_FIRST_TO_SECOND + GAP_BETWEEN_WORDS
    this.remainMs = this.totalMs
    stopAll()
    if (idx >= this.data.total) {
      this.finishReading()
      return
    }
    this.readNext(idx, this.readGen)
  },

  replayCurrent() {
    const q = this.data.questions[this.data.index]
    if (!q) return
    speak(q.extra.speakText || q.answer, this.data.speed).catch(() => {})
  },

  replayPrev() {
    this.jumpTo(this.data.index - 1)
  },

  replayNext() {
    this.jumpTo(this.data.index + 1)
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
    if (this.speakTick) clearInterval(this.speakTick)
    this.timer = null
    this.countdownTimer = null
    this.speakTick = null
  },

  onUnload() {
    this.cancelled = true
    this.readGen++ // 杀掉所有报词链
    this.clearTimers()
    clearWrongDraft()
  },

  // 注意：不实现 onHide 自动暂停——实测部分场景（音频会话被系统抢占、
  // 下拉通知栏、控制中心）会误触发 onHide，用户没碰手机却被暂停。
  // 真切后台时音频播完自然结束，词间倒计时继续走，体验可接受。
})
