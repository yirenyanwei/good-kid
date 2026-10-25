// 云函数 userConfig —— 用户配置读写
// 入参：{ action: 'get' | 'save', config? }

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const DEFAULT_CONFIG = {
  grades: { zh: 3, math: 3, en: 3 },
  volume: '上',
  speed: 'normal',
  weightedQuiz: true,
}

exports.main = async (event) => {
  const { action, config } = event
  const { OPENID } = cloud.getWXContext()

  try {
    const existing = await db
      .collection('db_user_config')
      .where({ openid: OPENID })
      .limit(1)
      .get()

    if (action === 'save') {
      const merged = { ...DEFAULT_CONFIG, ...config }
      if (existing.data.length > 0) {
        await db.collection('db_user_config').doc(existing.data[0]._id).update({
          data: { ...merged, updatedAt: Date.now() },
        })
      } else {
        await db.collection('db_user_config').add({
          data: { openid: OPENID, ...merged, updatedAt: Date.now() },
        })
      }
      return { ok: true }
    }

    // get
    if (existing.data.length > 0) {
      const { _id, openid, ...cfg } = existing.data[0]
      return cfg
    }
    return DEFAULT_CONFIG
  } catch (e) {
    console.error('[userConfig] 读写失败', e)
    return action === 'save' ? { ok: false } : DEFAULT_CONFIG
  }
}
