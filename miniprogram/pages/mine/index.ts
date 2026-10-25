// pages/mine/index.ts —— 我的 / 设置
import { getUserConfig, saveUserConfig, weeklyStats } from '../../utils/storage'

Page({
  data: {
    weekSummary: '',
    // 设置
    grade: 3,
    volume: '上' as '上' | '下',
    speed: 'normal' as 'slow' | 'normal' | 'fast',
    weighted: true,
    speeds: [
      { key: 'slow', name: '慢' },
      { key: 'normal', name: '中' },
      { key: 'fast', name: '快' },
    ],
  },

  onShow() {
    const cfg = getUserConfig()
    const ws = weeklyStats()
    this.setData({
      grade: cfg.grades.zh,
      volume: cfg.volume,
      speed: cfg.speed,
      weighted: cfg.weightedQuiz,
      weekSummary:
        ws.count > 0
          ? `${ws.count} 次 · ${ws.correctRate}% · 消灭 ${ws.killed} 题`
          : '本周暂无练习',
    })
  },

  goReport() {
    wx.showModal({
      title: '本周成绩',
      content: this.data.weekSummary,
      showCancel: false,
      confirmText: '知道了',
    })
  },

  setSpeed(e: WechatMiniprogram.TouchEvent) {
    const s = e.currentTarget.dataset.s as 'slow' | 'normal' | 'fast'
    const cfg = getUserConfig()
    cfg.speed = s
    saveUserConfig(cfg)
    this.setData({ speed: s })
  },

  toggleWeighted() {
    const cfg = getUserConfig()
    cfg.weightedQuiz = !cfg.weightedQuiz
    saveUserConfig(cfg)
    this.setData({ weighted: cfg.weightedQuiz })
  },
})
