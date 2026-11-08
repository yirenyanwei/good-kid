// pages/speech/index.ts —— 发音设置。中文、英文各自记语速和音色
import { getUserConfig, saveUserConfig } from '../../utils/storage'
import { ZH_VOICES, EN_VOICES } from '../../utils/voices'

type Speed = 'slow' | 'normal' | 'fast'

Page({
  data: {
    speeds: [
      { key: 'slow', name: '慢' },
      { key: 'normal', name: '中' },
      { key: 'fast', name: '快' },
    ],
    zhVoices: ZH_VOICES,
    enVoices: EN_VOICES,
    zhSpeed: 'normal' as Speed,
    enSpeed: 'normal' as Speed,
    zhVoice: 101002,
    enVoice: 101051,
  },

  onShow() {
    const cfg = getUserConfig()
    this.setData({
      zhSpeed: cfg.speechZh.speed,
      enSpeed: cfg.speechEn.speed,
      zhVoice: cfg.speechZh.voice,
      enVoice: cfg.speechEn.voice,
    })
  },

  setZhSpeed(e: WechatMiniprogram.TouchEvent) {
    const s = e.currentTarget.dataset.s as Speed
    const cfg = getUserConfig()
    cfg.speechZh.speed = s
    cfg.speed = s
    saveUserConfig(cfg)
    this.setData({ zhSpeed: s })
  },

  setEnSpeed(e: WechatMiniprogram.TouchEvent) {
    const s = e.currentTarget.dataset.s as Speed
    const cfg = getUserConfig()
    cfg.speechEn.speed = s
    saveUserConfig(cfg)
    this.setData({ enSpeed: s })
  },

  setZhVoice(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    const cfg = getUserConfig()
    cfg.speechZh.voice = id
    saveUserConfig(cfg)
    this.setData({ zhVoice: id })
  },

  setEnVoice(e: WechatMiniprogram.TouchEvent) {
    const id = Number(e.currentTarget.dataset.id)
    const cfg = getUserConfig()
    cfg.speechEn.voice = id
    saveUserConfig(cfg)
    this.setData({ enVoice: id })
  },
})
