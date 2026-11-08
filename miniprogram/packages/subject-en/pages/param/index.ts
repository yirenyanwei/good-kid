// packages/subject-en/pages/param/index.ts —— 单词默写参数（题量；范围从二级页带入）
// 作答页复用语文默写页（报两遍 / 勾错 / 入库），只换 subject 与样式
import { GenQuizParams } from '../../../../utils/types'
import { getUserConfig } from '../../../../utils/storage'
import { WORD_EN_LIST } from '../../../../utils/en-data'

function poolSize(mode: 'random' | 'unit', unit: number): number {
  if (mode === 'unit' && unit) {
    return WORD_EN_LIST.filter((x) => x.unit === unit).length
  }
  return WORD_EN_LIST.length
}

Page({
  data: {
    title: '单词默写',
    unitLabel: '词',
    range: '',
    mode: 'unit' as 'random' | 'unit',
    unit: 1,
    count: 10,
    max: 20,
    poolNote: '',
    advancedOpen: false,
    speeds: [
      { key: 'slow', name: '慢' },
      { key: 'normal', name: '中' },
      { key: 'fast', name: '快' },
    ],
    speed: 'normal' as 'slow' | 'normal' | 'fast',
  },

  onLoad(query: Record<string, string | undefined>) {
    const cfg = getUserConfig()
    const mode = (query.mode as 'random' | 'unit') || 'unit'
    const unit = Number(query.unit || 1)
    const cap = 20
    const realMax = Math.min(cap, poolSize(mode, unit))
    const safeMax = Math.max(realMax, 1)
    this.setData({
      max: safeMax,
      count: Math.min(10, safeMax),
      mode,
      unit,
      speed: cfg.speed,
      poolNote:
        realMax < cap && realMax > 0
          ? `当前范围内共 ${realMax} 个单词，最多出 ${realMax} 个`
          : '',
      range:
        mode === 'unit'
          ? `人教PEP · 三年级上 · 第 ${unit} 单元`
          : `人教PEP · 三年级上 · 随机混抽`,
    })
  },

  decCount() {
    if (this.data.count > 3) this.setData({ count: this.data.count - 1 })
  },
  incCount() {
    if (this.data.count < this.data.max) this.setData({ count: this.data.count + 1 })
  },

  toggleAdvanced() {
    this.setData({ advancedOpen: !this.data.advancedOpen })
  },

  pickSpeed(e: WechatMiniprogram.TouchEvent) {
    const s = e.currentTarget.dataset.s as 'slow' | 'normal' | 'fast'
    const cfg = getUserConfig()
    cfg.speed = s
    wx.setStorageSync('gk_user_config', cfg)
    this.setData({ speed: s })
  },

  start() {
    const p: GenQuizParams & { speed?: string } = {
      subject: 'en',
      style: 'word-en-dictate',
      grade: 3,
      volume: '上',
      mode: this.data.mode,
      unit: this.data.mode === 'unit' ? this.data.unit : undefined,
      count: this.data.count,
      speed: this.data.speed,
    }
    const qs = Object.keys(p)
      .filter((k) => (p as any)[k] !== undefined)
      .map((k) => `${k}=${encodeURIComponent(String((p as any)[k]))}`)
      .join('&')
    wx.navigateTo({ url: `/packages/subject-zh/pages/dictate/index?${qs}` })
  },

  goBack() {
    wx.navigateBack()
  },
})
