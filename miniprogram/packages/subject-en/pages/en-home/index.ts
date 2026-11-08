// packages/subject-en/pages/en-home/index.ts —— 英语二级页（单词默写 + 按单元）
import { getWrongItemsBySubject } from '../../../../utils/storage'
import { enDataStats } from '../../../../utils/en-data'

const STYLES = [
  { key: 'word-en-dictate', name: '单词默写', desc: '听英文和中文 · 纸上写单词 · 家长勾错', isNew: true },
]

Page({
  data: {
    styles: STYLES,
    mode: 'unit' as 'random' | 'unit',
    unit: 1,
    units: [1, 2, 3, 4, 5, 6],
    wrongTotal: 0,
    wrongToday: 0,
    stats: { words: 0, units: 6 },
  },

  onLoad() {
    const stats = enDataStats()
    const units: number[] = []
    for (let u = 1; u <= stats.units; u++) units.push(u)
    this.setData({ stats, units: units.length ? units : [1, 2, 3, 4, 5, 6] })
  },

  onShow() {
    this.refreshWrong()
  },

  refreshWrong() {
    const wrongs = getWrongItemsBySubject('en')
    const active = wrongs.filter((w) => !w.mastered)
    const today = new Date().toDateString()
    const todayWrong = active.filter(
      (w) => new Date(w.lastWrongTs).toDateString() === today
    ).length
    this.setData({ wrongTotal: active.length, wrongToday: todayWrong })
  },

  pickMode() {
    const next = this.data.mode === 'random' ? 'unit' : 'random'
    this.setData({ mode: next })
  },

  pickRandom() {
    this.setData({ mode: 'random' })
  },

  pickUnit(e: WechatMiniprogram.TouchEvent) {
    const u = Number(e.currentTarget.dataset.u)
    this.setData({ mode: 'unit', unit: u })
  },

  onStyle(e: WechatMiniprogram.TouchEvent) {
    const style = e.currentTarget.dataset.style as string
    wx.navigateTo({
      url: `/packages/subject-en/pages/param/index?style=${style}&mode=${this.data.mode}${
        this.data.mode === 'unit' && this.data.unit ? `&unit=${this.data.unit}` : ''
      }`,
    })
  },

  goBack() {
    wx.navigateBack()
  },
})
