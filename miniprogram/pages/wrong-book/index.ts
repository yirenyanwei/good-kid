// pages/wrong-book/index.ts —— 错题本（跨科筛选 + 清零进度）
import { getWrongItems } from '../../utils/storage'
import { WrongItem, Subject } from '../../utils/types'

Page({
  data: {
    filter: 'all' as 'all' | Subject,
    tabs: [
      { key: 'all', name: '全部' },
      { key: 'zh', name: '语文' },
      { key: 'math', name: '数学' },
      { key: 'en', name: '英语' },
    ],
    items: [] as WrongItem[],
    total: 0,
    active: 0,
    mastered: 0,
  },

  onShow() {
    this.refresh()
  },

  refresh() {
    const all = getWrongItems()
    const filter = this.data.filter
    const items = (filter === 'all' ? all : all.filter((w) => w.subject === filter))
      .filter((w) => !w.mastered)
      .sort((a, b) => b.lastWrongTs - a.lastWrongTs)
    this.setData({
      items,
      total: all.length,
      active: all.filter((w) => !w.mastered).length,
      mastered: all.filter((w) => w.mastered).length,
    })
  },

  pickFilter(e: WechatMiniprogram.TouchEvent) {
    this.setData({ filter: e.currentTarget.dataset.k as 'all' | Subject })
    this.refresh()
  },

  timeAgo(ts: number): string {
    const diff = Date.now() - ts
    if (diff < 3600_000) return '刚刚'
    if (diff < 86400_000) return '今天'
    if (diff < 2 * 86400_000) return '昨天'
    return `${Math.floor(diff / 86400_000)} 天前`
  },

  onItem(e: WechatMiniprogram.TouchEvent) {
    const i = e.currentTarget.dataset.i as number
    const item = this.data.items[i]
    wx.showModal({
      title: item.content,
      content: `${item.detail}\n错 ${item.wrongCount} 次 · 连对 ${item.streakRight}/2\n（错题将通过加权抽样重现）`,
      showCancel: false,
      confirmText: '知道了',
    })
  },

  rePractice() {
    wx.switchTab({ url: '/pages/home/index' })
  },
})
