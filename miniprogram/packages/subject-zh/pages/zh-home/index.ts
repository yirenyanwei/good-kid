// packages/subject-zh/pages/zh-home/index.ts —— 语文二级页
// 三种练习样式卡 + 出题范围 + 今日错题卡
import { getWrongItemsBySubject } from '../../../../utils/storage'
import { zhDataStats } from '../../../../utils/zh-data'

const STYLES = [
  { key: 'hanzi-dictate', name: '生字默写', desc: '单字 · TTS 报词 · 家长勾错', isNew: false },
  { key: 'word-dictate', name: '词语听写', desc: '课本词语表整词 · 报两遍 · 纸上默写', isNew: true },
  { key: 'pinyin-choice', name: '看拼音选字', desc: '四选一 · 即时判题', isNew: false },
]

Page({
  data: {
    styles: STYLES,
    grade: 3,
    volume: '上' as '上' | '下',
    // 出题范围：默认第 1 单元（随机混抽放最后，突出教材顺序）
    mode: 'unit' as 'random' | 'unit',
    unit: 1,
    units: [1, 2, 3, 4, 5, 6, 7, 8],
    // 错题摘要
    wrongTotal: 0,
    wrongToday: 0,
    stats: { hanzi: 64, words: 39, units: 8 },
  },

  onLoad() {
    this.setData({ stats: zhDataStats() })
  },

  onShow() {
    this.refreshWrong()
  },

  refreshWrong() {
    const wrongs = getWrongItemsBySubject('zh')
    const active = wrongs.filter((w) => !w.mastered)
    const today = new Date().toDateString()
    const todayWrong = active.filter(
      (w) => new Date(w.lastWrongTs).toDateString() === today
    ).length
    this.setData({ wrongTotal: active.length, wrongToday: todayWrong })
  },

  pickMode() {
    // 点击「出题范围」行文案切换：单元 <-> 随机混抽
    const next = this.data.mode === 'random' ? 'unit' : 'random'
    this.setData({ mode: next })
  },

  pickRandom() {
    this.setData({ mode: 'random' })
  },

  pickUnit(e: WechatMiniprogram.TouchEvent) {
    const u = e.currentTarget.dataset.u as number
    this.setData({ mode: 'unit', unit: u })
  },

  onStyle(e: WechatMiniprogram.TouchEvent) {
    const style = e.currentTarget.dataset.style as string
    wx.navigateTo({
      url: `/packages/subject-zh/pages/param/index?style=${style}&mode=${this.data.mode}${
        this.data.mode === 'unit' && this.data.unit ? `&unit=${this.data.unit}` : ''
      }`,
    })
  },

  goBack() {
    wx.navigateBack()
  },
})
