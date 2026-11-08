// packages/subject-math/pages/math-home/index.ts —— 数学二级页（口算/混合运算入口）
import { getWrongItemsBySubject } from '../../../../utils/storage'
import { readNavSafeArea } from '../../../../utils/nav'

const STYLES = [
  {
    key: 'math-calc',
    name: '口算练习',
    desc: '加减乘除 · 自由勾选',
    opLabel: '可单选可多选',
    isNew: true,
  },
  {
    key: 'math-mixed',
    name: '混合运算',
    desc: '加减乘除混合 · 含括号题',
    opLabel: '两位算式',
    isNew: true,
  },
]

Page({
  data: {
    statusBarHeight: 20,
    navPadRight: 96,
    styles: STYLES,
    wrongToday: 0,
    wrongTotal: 0,
  },

  onLoad() {
    const nav = readNavSafeArea()
    this.setData({ statusBarHeight: nav.statusBarHeight, navPadRight: nav.navPadRight })
  },

  onShow() {
    const wrongs = getWrongItemsBySubject('math')
    const today = new Date().toDateString()
    const wrongToday = wrongs.filter((w) => !w.mastered && new Date(w.lastWrongTs).toDateString() === today).length
    this.setData({
      wrongTotal: wrongs.filter((w) => !w.mastered).length,
      wrongToday,
    })
  },

  onStyle(e: WechatMiniprogram.TouchEvent) {
    const style = e.currentTarget.dataset.style as string
    wx.navigateTo({ url: `/packages/subject-math/pages/param/index?style=${style}` })
  },

  goBack() {
    wx.navigateBack()
  },
})
