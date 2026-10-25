// pages/result/index.ts —— 结果页（三科复用：大分数 + 星星 + 分享）
import { appendQuizLog } from '../../utils/storage'

const STYLE_NAMES: Record<string, string> = {
  'hanzi-dictate': '生字默写',
  'word-dictate': '词语听写',
  'pinyin-choice': '看拼音选字',
}

Page({
  data: {
    correct: 0,
    total: 10,
    styleName: '',
    newWrong: 0,
    graduated: 0,
    stars: 0,
    flameDays: 1,
  },

  onLoad(query: Record<string, string | undefined>) {
    const correct = Number(query.correct || 0)
    const total = Number(query.total || 10)
    const style = query.style || 'hanzi-dictate'
    const newWrong = Number(query.newWrong || 0)
    const graduated = Number(query.graduated || 0)
    // 星级：≥9 三星 / ≥7 两星 / ≥5 一星
    const rate = total > 0 ? correct / total : 0
    const stars = rate >= 0.9 ? 3 : rate >= 0.7 ? 2 : rate >= 0.5 ? 1 : 0
    // 记日志（周报/续练数据源）
    appendQuizLog({
      quizId: `local-${Date.now()}`,
      subject: 'zh',
      style: style as any,
      correct,
      total,
      duration: 0,
      ts: Date.now(),
    })
    // 火焰：本地按日聚合
    const flame = this.computeFlame()
    this.setData({
      correct,
      total,
      styleName: STYLE_NAMES[style] || '练习',
      newWrong,
      graduated,
      stars,
      flameDays: flame,
    })
  },

  computeFlame(): number {
    const logs = wx.getStorageSync<any[]>('gk_quiz_logs') || []
    const days = new Set(logs.map((l) => new Date(l.ts).toDateString()))
    // 简单连续天数：从今天往回数
    let flame = 0
    const d = new Date()
    while (days.has(d.toDateString())) {
      flame++
      d.setDate(d.getDate() - 1)
    }
    return flame
  },

  onShareAppMessage(): WechatMiniprogram.Page.ICustomShareContent {
    const { correct, total, styleName } = this.data
    return {
      title: `好孩子 · ${styleName} ${correct}/${total}，连续练习 ${this.data.flameDays} 天`,
      path: '/pages/home/index',
    }
  },

  goHome() {
    wx.switchTab({ url: '/pages/home/index' })
  },

  again() {
    wx.navigateBack()
  },
})
