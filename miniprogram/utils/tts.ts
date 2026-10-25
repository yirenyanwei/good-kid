// tts.ts —— 语音报词（腾讯云语音合成 + 云函数方案）
// 路线：speak() -> wx.cloud.callFunction('tts') -> base64 mp3 -> 本地临时文件 -> InnerAudioContext 播放
// 背景：微信同声传译插件属 IT 科技类目，个人主体小程序无法添加，故改走云函数。
// 密钥配置在云函数环境变量（TENCENT_SECRET_ID / TENCENT_SECRET_KEY），端上零密钥。
// 容错：云函数不可用（未部署/未配密钥/未开通云环境）时静默降级，由页面用文字提示兜底。
//
// 导出接口与旧插件版完全一致：speak / wait / stopAll / ttsAvailable，页面零改动。

export type Speed = 'slow' | 'normal' | 'fast'

interface TtsResult {
  code: number
  audio?: string
  message?: string
}

/** 播放器实例类型（miniprogram-api-typings 提供的命名空间） */
type InnerAudio = WechatMiniprogram.InnerAudioContext

// base64 -> ArrayBuffer（小程序 ArrayBuffer 写文件用）
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, '')
  const len = Math.floor(clean.length / 4) * 4 // 去掉 padding
  const bytes = new Uint8Array(len / 4 * 3)
  let p = 0
  for (let i = 0; i < len; i += 4) {
    const n =
      (chars.indexOf(clean[i]) << 18) |
      (chars.indexOf(clean[i + 1]) << 12) |
      (chars.indexOf(clean[i + 2]) << 6) |
      chars.indexOf(clean[i + 3])
    bytes[p++] = (n >> 16) & 0xff
    bytes[p++] = (n >> 8) & 0xff
    bytes[p++] = n & 0xff
  }
  return bytes.buffer
}

let currentAudio: InnerAudio | null = null
/** 当前在播音频的确定性放行函数：stopAll 直接调用，不依赖 onStop 回调是否触发 */
let currentSettle: (() => void) | null = null

// 顺序化：同一时刻只播一条，避免报词/结束语音重叠
let playQueue: Promise<unknown> = Promise.resolve()

/** 合成并播放一段文本；resolve 在播放完成后触发（含时长 ms） */
export function speak(text: string, speed: Speed = 'normal'): Promise<number> {
  const run = () => new Promise<number>((resolve, reject) => {
    if (!text) {
      reject(new Error('empty text'))
      return
    }
    wx.cloud.callFunction({
      name: 'tts',
      data: { text, speed },
      success: (res) => {
        const r = res.result as TtsResult
        if (!r || r.code !== 0 || !r.audio) {
          // code 2=未配密钥 3/4=合成失败：静默降级 resolve 0，流程继续（页面已展示文字）
          console.warn('[tts] 云函数返回不可播，降级', r && r.message)
          resolve(0)
          return
        }
        // base64 写临时文件再播（避免超长 dataURL 限流）
        const buf = base64ToArrayBuffer(r.audio)
        const path = `${wx.env.USER_DATA_PATH}/tts-${Date.now()}.mp3`
        const fs = wx.getFileSystemManager()
        fs.writeFile({
          filePath: path,
          data: buf,
          success: () => {
            stopAll()
            const inner = wx.createInnerAudioContext()
            currentAudio = inner
            inner.src = path
            // 语速由云函数按腾讯云语义合成（slow=-1/normal=0/fast=1），端上不再叠加变速：
            // 变速播放会劣化音质，唇齿音 f/p 等摩擦音最易糊（教育报词场景咬字清晰优先）
            // settled 防重复 resolve；stopAll 持有 settle 引用可确定性放行（不依赖 onStop）
            let settled = false
            const done = (ms: number) => {
              if (settled) return
              settled = true
              currentSettle = null
              clearTimeout(watchdog)
              resolve(ms)
            }
            currentSettle = () => done(0)
            const watchdog = setTimeout(() => {
              console.warn('[tts] 看门狗超时（onEnded/onStop 均未触发），强制放行')
              try { fs.unlink({ filePath: path }) } catch (e) { /* 忽略 */ }
              done(0)
            }, Math.max(10000, text.length * 400))
            inner.onEnded(() => {
              // 播完清临时文件，避免用户目录膨胀
              try { fs.unlink({ filePath: path }) } catch (e) { /* 忽略 */ }
              done(inner.duration * 1000 || 0)
            })
            inner.onStop(() => {
              // 被暂停/停止（stopAll）：立即 resolve，避免播放队列卡死
              try { fs.unlink({ filePath: path }) } catch (e) { /* 忽略 */ }
              done(0)
            })
            inner.onError((e) => {
              console.warn('[tts] 播放失败，降级', e)
              try { fs.unlink({ filePath: path }) } catch (err) { /* 忽略 */ }
              done(0)
            })
            inner.play()
          },
          fail: (e) => {
            console.warn('[tts] 写文件失败，降级', e)
            resolve(0)
          },
        })
      },
      fail: (err) => {
        // 云函数未部署/云环境未开通：静默降级
        console.warn('[tts] callFunction 失败，降级', err)
        resolve(0)
      },
    })
  })
  playQueue = playQueue.then(run, run)
  return playQueue as Promise<number>
}

/** 播放完等待 ms（词间 8 秒倒计时的锚点） */
export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 停止当前播报（页面暂停/退出时调用）。
 *  持有 currentSettle 引用可确定性放行播放队列——部分机型 stop()/destroy()
 *  后 onStop 回调不触发（先 stop 后立即 destroy 会销毁回调注册），必须直调 settle */
export function stopAll(): void {
  if (currentAudio) {
    const a = currentAudio
    currentAudio = null
    try {
      a.stop()
    } catch (e) {
      // 忽略
    }
    // destroy 延迟到下一轮：确保 stop 触发的 onStop 有机会执行
    setTimeout(() => {
      try { a.destroy() } catch (e) { /* 忽略 */ }
    }, 0)
  }
  if (currentSettle) {
    const settle = currentSettle
    currentSettle = null
    settle()
  }
}

/** TTS 是否可用：需已开通云环境（cloudEnabled）且 tts 云函数已部署 */
export function ttsAvailable(): boolean {
  const g = getApp<{ globalData: { cloudEnabled: boolean } }>()
  return !!(g && g.globalData.cloudEnabled)
}
