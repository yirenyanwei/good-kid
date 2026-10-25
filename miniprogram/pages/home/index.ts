// pages/home/index.ts —— 首页（主 CTA 继续昨天 + 三科卡 + 周报摘要条）
import { getUserConfig } from '../../utils/storage'
import { zhDataStats } from '../../utils/zh-data'

Page({
  data: {
    grade: 3,
    volume: '上' as '上' | '下',
    gradeOptions: [1, 2, 3, 4, 5, 6],
    showGradeSheet: false,
    // 继续昨天 / 首次练习
    hasHistory: false,
    lastSummary: '',
    // 周报摘要
    weekSummary: '',
    stats: { hanzi: 64, words: 39, units: 8 },
    zhReady: true,
    mathReady: false,
    enReady: false,
  },

  onLoad() {
    const cfg = getUserConfig()
    this.setData({
      grade: cfg.grades.zh,
      volume: cfg.volume,
      stats: zhDataStats(),
      hasHistory: cfg.grades.zh === 3, // V0 词库仅三年级
    })
    this.refreshLast()
  },

  onShow() {
    this.refreshLast()
  },

  refreshLast() {
    const logs = wx.getStorageSync<any[]>('gk_quiz_logs') || []
    if (logs.length > 0) {
      const last = logs[logs.length - 1]
      const styleName: Record<string, string> = {
        'hanzi-dictate': '生字默写',
        'word-dictate': '词语听写',
        'pinyin-choice': '看拼音选字',
      }
      this.setData({
        hasHistory: true,
        lastSummary: `语文 · ${styleName[last.style] || '练习'} · ${last.total} 题 · ${
          last.total - last.correct
        } 个错题`,
      })
    } else {
      this.setData({ hasHistory: false, lastSummary: '' })
    }
    const ws = require('../../utils/storage').weeklyStats()
    if (ws.count > 0) {
      this.setData({
        weekSummary: `本周练习 ${ws.count} 次 · 正确率 ${ws.correctRate}%`,
      })
    } else {
      this.setData({ weekSummary: '完成第一次练习后生成周报' })
    }
  },

  // ---- 年级弹层 ----
  openGradeSheet() {
    this.setData({ showGradeSheet: true })
  },
  closeGradeSheet() {
    this.setData({ showGradeSheet: false })
  },
  noop() {},
  pickGrade(e: WechatMiniprogram.TouchEvent) {
    const g = e.currentTarget.dataset.g as number
    const cfg = getUserConfig()
    cfg.grades.zh = g
    cfg.grades.math = g
    cfg.grades.en = Math.max(g, 3) // 英语三年级起
    wx.setStorageSync('gk_user_config', cfg)
    this.setData({ grade: g, showGradeSheet: false, zhReady: g === 3 })
  },

  // ---- 主 CTA：继续昨天 → 直接开一卷生字默写 ----
  onMainCta() {
    if (!this.data.zhReady) {
      wx.showToast({ title: '该年级词库整理中', icon: 'none' })
      return
    }
    wx.navigateTo({ url: '/packages/subject-zh/pages/zh-home/index' })
  },

  // ---- 三科卡 ----
  onSubject(e: WechatMiniprogram.TouchEvent) {
    const s = e.currentTarget.dataset.s as string
    if (s === 'zh') {
      wx.navigateTo({ url: '/packages/subject-zh/pages/zh-home/index' })
    } else if (s === 'math') {
      wx.showToast({ title: '数学分包 V1.1 开发中', icon: 'none' })
    } else {
      wx.showToast({ title: '英语分包 V1.2 开发中', icon: 'none' })
    }
  },
})
