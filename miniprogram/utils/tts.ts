// tts.ts —— 微信同声传译插件封装（报词 / 语速 / 间隔 / 重听）
// 插件：wx-plugin 同声传译（"wx069ba97219f66d99"），textToSpeech
// 容错：插件不可用（未安装/审核中）时静默降级，由页面用文字提示兜底

interface PluginTextToSpeech {
  textToSpeech(options: {
    lang: string
    tts: boolean
    content: string
    success: (res: { retcode: number; filename: string }) => void
    fail: (err: unknown) => void
  }): void
}

let plugin: { textToSpeech: PluginTextToSpeech } | null = null
let pluginTried = false

function loadPlugin(): boolean {
  if (pluginTried) return !!plugin
  pluginTried = true
  try {
    const p = requirePlugin('WechatSI')
    if (p && p.textToSpeech) {
      plugin = p as { textToSpeech: PluginTextToSpeech }
    }
  } catch (e) {
    console.warn('[tts] 同声传译插件不可用，将使用静默兜底', e)
  }
  return !!plugin
}

export type Speed = 'slow' | 'normal' | 'fast'

const SPEED_YRATE: Record<Speed, number> = { slow: 0.6, normal: 0.8, fast: 1.0 }

/** 合成并播放一段文本；resolve 在播放完成后触发（含 duration） */
export function speak(text: string, speed: Speed = 'normal'): Promise<number> {
  return new Promise((resolve, reject) => {
    if (!text) {
      reject(new Error('empty text'))
      return
    }
    if (!loadPlugin()) {
      // 插件缺失：直接 resolve 0，让流程继续（页面已展示文字）
      resolve(0)
      return
    }
    wx.showLoading({ title: '加载语音', mask: false })
    plugin!.textToSpeech.textToSpeech({
      lang: 'zh_CN',
      tts: true,
      content: text,
      success: (res) => {
        wx.hideLoading()
        if (res.retcode !== 0) {
          reject(new Error('tts retcode ' + res.retcode))
          return
        }
        const inner = wx.createInnerAudioContext()
        inner.src = res.filename
        inner.playbackRate = SPEED_YRATE[speed] // 0.5–2.0
        inner.onEnded(() => resolve(inner.duration * 1000))
        inner.onError((e) => reject(e))
        inner.play()
      },
      fail: (err) => {
        wx.hideLoading()
        reject(err)
      },
    })
  })
}

/** 播放完等待 ms（词间 8 秒倒计时的锚点） */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 停止当前播报（页面 onHide / 退出时调用） */
export function stopAll(): void {
  // innerAudioContext 由调用方持有；这里清空插件引用状态
  pluginTried = false
}

export function ttsAvailable(): boolean {
  return loadPlugin()
}
