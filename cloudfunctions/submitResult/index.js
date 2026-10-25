// 云函数 submitResult —— 判题入库
// 入参：{ quizId, subject, style, questions: [{qid, itemRef, content, detail}], answers: [{qid, correct}] }
// 事务：写 db_quiz_log → upsert db_wrong_book（毕业：wrongCount≥3 连对 2 次）

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event) => {
  const { quizId, subject, style, questions = [], answers = [] } = event
  const { OPENID } = cloud.getWXContext()

  const qMap = new Map(questions.map((q) => [q.qid, q]))
  const correctCount = answers.filter((a) => a.correct).length

  const newWrong = []
  const graduated = []

  // 逐条 upsert 错题本
  for (const a of answers) {
    const q = qMap.get(a.qid)
    if (!q) continue
    try {
      const existing = await db
        .collection('db_wrong_book')
        .where({ openid: OPENID, itemRef: q.itemRef })
        .limit(1)
        .get()

      if (a.correct) {
        if (existing.data.length > 0) {
          const w = existing.data[0]
          const streak = (w.streakRight || 0) + 1
          const willGraduate = w.wrongCount >= 3 && streak >= 2 && !w.mastered
          await db
            .collection('db_wrong_book')
            .doc(w._id)
            .update({
              data: {
                streakRight: streak,
                mastered: willGraduate ? true : w.mastered,
              },
            })
          if (willGraduate) graduated.push(q.itemRef)
        }
      } else {
        if (existing.data.length > 0) {
          const w = existing.data[0]
          await db
            .collection('db_wrong_book')
            .doc(w._id)
            .update({
              data: {
                wrongCount: _.inc(1),
                streakRight: 0,
                mastered: false,
                lastWrongTs: Date.now(),
              },
            })
        } else {
          await db.collection('db_wrong_book').add({
            data: {
              openid: OPENID,
              subject,
              grade: 3,
              itemRef: q.itemRef,
              content: q.content,
              detail: q.detail,
              wrongCount: 1,
              streakRight: 0,
              mastered: false,
              lastWrongTs: Date.now(),
            },
          })
          newWrong.push(q.itemRef)
        }
      }
    } catch (e) {
      console.error('[submitResult] 错题更新失败', q.itemRef, e)
    }
  }

  // 练习日志
  try {
    await db.collection('db_quiz_log').add({
      data: {
        openid: OPENID,
        quizId,
        subject,
        style,
        correct: correctCount,
        total: answers.length,
        duration: 0,
        ts: Date.now(),
      },
    })
  } catch (e) {
    console.warn('[submitResult] 日志写入失败', e)
  }

  return {
    total: answers.length,
    correct: correctCount,
    newWrong,
    graduated,
  }
}
