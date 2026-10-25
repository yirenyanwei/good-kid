// packages/subject-zh/pages/param/index.ts —— 参数页（三样式复用：范围/题量/高级折叠）
import { GenQuizParams, ZhStyle } from '../../../../utils/types'
import { getUserConfig } from '../../../../utils/storage'

const STYLE_META: Record<ZhStyle, { title: string; max: number; unitLabel: string }> = {
  'hanzi-dictate': { title: '生字默写', max: 20, unitLabel: '字' },
  'word-dictate': { title: '词语听写', max: 15, unitLabel: '词' },
  'pinyin-choice': { title: '看拼音选字', max: 20, unitLabel: '题' },
}

Page({
  data: {
    style: 'hanzi-dictate' as ZhStyle,
    title: '',
    unitLabel: '字',
    range: '',
    mode: 'random' as 'random' | 'unit',
    unit: 0,
    count: 10,
    max: 20,
    advancedOpen: false,
    // 高级：报词语速
    speeds: [
      { key: 'slow', name: '慢' },
      { key: 'normal', name: '中' },
      { key: 'fast', name: '快' },
    ],
    speed: 'normal' as 'slow' | 'normal' | 'fast',
  },

  onLoad(query: Record<string, string | undefined>) {
    const style = (query.style || 'hanzi-dictate') as ZhStyle
    const cfg = getUserConfig()
    const meta = STYLE_META[style]
    const mode = (query.mode as 'random' | 'unit') || 'random'
    const unit = Number(query.unit || 0)
    this.setData({
      style,
      title: meta.title,
      unitLabel: meta.unitLabel,
      max: meta.max,
      mode,
      unit,
      speed: cfg.speed,
      range:
        mode === 'unit'
          ? `统编版 · 三年级上 · 第 ${unit} 单元`
          : `统编版 · 三年级上 · 随机混抽`,
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
      subject: 'zh',
      style: this.data.style,
      grade: 3,
      volume: '上',
      mode: this.data.mode as 'random',
      unit: this.data.mode === 'unit' ? this.data.unit : undefined,
      count: this.data.count,
      speed: this.data.speed,
    }
    const qs = Object.keys(p)
      .filter((k) => (p as any)[k] !== undefined)
      .map((k) => `${k}=${encodeURIComponent(String((p as any)[k]))}`)
      .join('&')
    // 按样式分流：选字题进 choice（即时判题），听写类进 dictate
    const dest =
      this.data.style === 'pinyin-choice'
        ? '/packages/subject-zh/pages/choice/index'
        : '/packages/subject-zh/pages/dictate/index'
    wx.navigateTo({ url: `${dest}?${qs}` })
  },

  goBack() {
    wx.navigateBack()
  },
})
