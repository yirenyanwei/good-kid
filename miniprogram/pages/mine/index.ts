// pages/mine/index.ts —— 我的 / 设置
import { getUserConfig, saveUserConfig, weeklyStats } from '../../utils/storage'
import { ZH_VOICES, EN_VOICES, voiceName } from '../../utils/voices'

Page({
  data: {
    weekSummary: '',
    // 设置
    grade: 3,
    volume: '上' as '上' | '下',
    weighted: true,
    speechSummary: '智聆 / WeRose',
  },

  onShow() {
    const cfg = getUserConfig()
    const ws = weeklyStats()
    this.setData({
      grade: cfg.grades.zh,
      volume: cfg.volume,
      weighted: cfg.weightedQuiz,
      speechSummary: `${voiceName(ZH_VOICES, cfg.speechZh.voice, '智聆')} / ${voiceName(EN_VOICES, cfg.speechEn.voice, 'WeRose')}`,
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

  goSpeech() {
    wx.navigateTo({ url: '/pages/speech/index' })
  },

  toggleWeighted() {
    const cfg = getUserConfig()
    cfg.weightedQuiz = !cfg.weightedQuiz
    saveUserConfig(cfg)
    this.setData({ weighted: cfg.weightedQuiz })
  },
})
