// packages/subject-math/pages/param/index.ts —— 数学参数页
// math-calc：加减乘除多选（至少勾 1 个）+ 题量
// math-mixed：题量（运算符全混合，无需选择）
import { MathOp } from '../../../../utils/types'

const OPS: { key: MathOp; sym: string; name: string }[] = [
  { key: 'add', sym: '+', name: '加法' },
  { key: 'sub', sym: '−', name: '减法' },
  { key: 'mul', sym: '×', name: '乘法' },
  { key: 'div', sym: '÷', name: '除法' },
]

const TITLE: Record<string, { title: string; unitLabel: string; max: number }> = {
  'math-calc': { title: '口算练习', unitLabel: '题', max: 50 },
  'math-mixed': { title: '混合运算', unitLabel: '题', max: 30 },
}

Page({
  data: {
    style: 'math-calc',
    title: '',
    ops: OPS,
    // 勾选状态：默认全选（口算练混合最常见；单选自己点掉即可）
    checked: { add: true, sub: true, mul: true, div: true } as Record<MathOp, boolean>,
    checkedCount: 4,
    count: 10,
    max: 50,
    unitLabel: '题',
  },

  onLoad(query: Record<string, string | undefined>) {
    const style = query.style || 'math-calc'
    const meta = TITLE[style] || TITLE['math-calc']
    this.setData({
      style,
      title: meta.title,
      max: meta.max,
      unitLabel: meta.unitLabel,
      count: Math.min(this.data.count, meta.max),
    })
  },

  toggleOp(e: WechatMiniprogram.TouchEvent) {
    const key = e.currentTarget.dataset.op as MathOp
    const checked = { ...this.data.checked }
    const newCount = checked[key] ? this.data.checkedCount - 1 : this.data.checkedCount + 1
    if (newCount < 1) {
      // 至少保留 1 个运算符
      wx.showToast({ title: '至少选 1 种运算', icon: 'none' })
      return
    }
    checked[key] = !checked[key]
    this.setData({ checked, checkedCount: newCount })
  },

  decCount() {
    if (this.data.count > 3) this.setData({ count: this.data.count - 1 })
  },
  incCount() {
    if (this.data.count < this.data.max) this.setData({ count: this.data.count + 1 })
  },

  start() {
    const style = this.data.style
    const ops = (Object.keys(this.data.checked) as MathOp[]).filter((k) => this.data.checked[k])
    wx.navigateTo({
      url: `/packages/subject-math/pages/calc/index?style=${style}&count=${this.data.count}&ops=${ops.join(',')}`,
    })
  },

  goBack() {
    wx.navigateBack()
  },
})
