// 云函数 tts —— 腾讯云语音合成（基础语音合成 TextToVoice）
// 入参：{ text, speed }  speed: 'slow' | 'normal' | 'fast'
// 腾讯云 Speed 范围 [-2, 6]，0 = 正常人声语速；负值更慢、正值更快
// 教训：0.6/0.8 都属于「快」，报词听不清（旧插件语义不能照搬）
const SPEED_MAP = { slow: -1, normal: 0, fast: 1 }
// 密钥：云函数环境变量 TENCENT_SECRET_ID / TENCENT_SECRET_KEY（在云开发控制台配置，勿写死在代码里）
// 免费额度：每月 800 万字符（基础语音合成长文本版），个人主体可直接开通
// 签名：TC3-HMAC-SHA256，纯 Node crypto 实现，零外部依赖（部署快、冷启动小）

const crypto = require('crypto')

const ENDPOINT = 'tts.tencentcloudapi.com'
const SERVICE = 'tts'
const REGION = 'ap-guangzhou'

// 基础语音合成支持的音色：101001（智语，基础女声）发音清晰适合报词
// 注意：101 是老版编号已不被 2019-08-23 版 TextToVoice 接受
const VOICE = 101001

function sha256Hex(msg) {
  return crypto.createHash('sha256').update(msg).digest('hex')
}

function hmac(key, msg) {
  return crypto.createHmac('sha256', key).update(msg).digest()
}

/**
 * TC3-HMAC-SHA256 签并发起请求
 */
async function callTencentTTS(secretId, secretKey, payload) {
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

  // 1. 拼接规范请求串
  const httpRequestMethod = 'POST'
  const canonicalUri = '/'
  const canonicalQueryString = ''
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${ENDPOINT}\n`
  const signedHeaders = 'content-type;host'
  const hashedRequestPayload = sha256Hex(body)
  const canonicalRequest = [
    httpRequestMethod,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    hashedRequestPayload,
  ].join('\n')

  // 2. 拼接签名字符串
  const algorithm = 'TC3-HMAC-SHA256'
  const credentialScope = `${date}/${SERVICE}/tc3_request`
  const hashedCanonicalRequest = sha256Hex(canonicalRequest)
  const stringToSign = [
    algorithm,
    timestamp,
    credentialScope,
    hashedCanonicalRequest,
  ].join('\n')

  // 3. 计算签名
  const secretDate = hmac(`TC3${secretKey}`, date)
  const secretService = hmac(secretDate, SERVICE)
  const secretSigning = hmac(secretService, 'tc3_request')
  const signature = crypto.createHmac('sha256', secretSigning).update(stringToSign).digest('hex')

  // 4. Authorization
  const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const https = require('https')
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: ENDPOINT,
        method: 'POST',
        path: '/',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Host: ENDPOINT,
          Authorization: authorization,
          'X-TC-Action': 'TextToVoice',
          'X-TC-Version': '2019-08-23',
          'X-TC-Timestamp': String(timestamp),
          'X-TC-Region': REGION,
        },
      },
      (res) => {
        let data = ''
        res.on('data', (d) => (data += d))
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(e)
          }
        })
      }
    )
    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

exports.main = async (event) => {
  const { text, speed = 'normal' } = event
  if (!text || typeof text !== 'string') {
    return { code: 1, message: 'text required' }
  }
  const textTrimmed = text.slice(0, 150) // 基础版单次上限 150 字符，报词场景足够

  const secretId = process.env.TENCENT_SECRET_ID
  const secretKey = process.env.TENCENT_SECRET_KEY
  if (!secretId || !secretKey) {
    // 未配置密钥：返回 code 2，前端走静默兜底（文字提示，不报错弹窗）
    return { code: 2, message: 'TENCENT_SECRET_ID/TENCENT_SECRET_KEY 未配置，请在云开发控制台-云函数-环境变量中配置' }
  }

  try {
    const res = await callTencentTTS(secretId, secretKey, {
      Text: textTrimmed,
      SessionId: `tts-${Date.now()}`,
      ModelType: 1,
      Volume: 5, // 范围 [0,10]，拉大音量保证手机外放清晰
      Speed: SPEED_MAP[speed] || 0,
      VoiceType: VOICE,
      PrimaryLanguage: 1, // 中文
      SampleRate: 16000,
      Codec: 'mp3',
    })
    if (res.Response && res.Response.Audio) {
      return { code: 0, audio: res.Response.Audio }
    }
    console.error('[tts] 腾讯云返回异常', res.Response && res.Response.Error)
    return { code: 3, message: (res.Response && res.Response.Error && res.Response.Error.Message) || 'tts failed' }
  } catch (e) {
    console.error('[tts] 请求失败', e)
    return { code: 4, message: String(e && e.message) || 'request failed' }
  }
}
