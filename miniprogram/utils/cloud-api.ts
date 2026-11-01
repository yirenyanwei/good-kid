// cloud-api.ts —— 云函数调用统一封装（request 层）
// V0 LocalImpl：词库本地、出题端上、错题本 storage
// V1 CloudImpl：wx.cloud.callFunction（入参出参与本地完全一致，切换只换实现类）

import { GenQuizParams, Quiz, SubmitAnswers, SubmitSummary, UserConfig } from './types'
import { genQuizLocal } from './quiz-engine'
import { genMathQuiz } from './math-engine'
import { getUserConfig, saveUserConfig, applyWrongUpdates } from './storage'

interface QuizAPI {
  genQuiz(params: GenQuizParams): Promise<Quiz>
  submitResult(quiz: Quiz, answers: SubmitAnswers[]): Promise<SubmitSummary>
  getUserConfig(): Promise<UserConfig>
  saveUserConfig(c: UserConfig): Promise<void>
}

// ---------------- V0 本地实现 ----------------

const LocalImpl: QuizAPI = {
  async genQuiz(params) {
    if (params.subject === 'math') return genMathQuiz(params)
    return genQuizLocal(params)
  },

  async submitResult(quiz, answers) {
    const cfg = getUserConfig()
    // answers 与 quiz.questions 按 qid 对齐，补齐 content/detail（错题本展示用）
    const rich = answers.map((a) => {
      const q = quiz.questions.find((x) => x.qid === a.qid)
      return {
        itemRef: q?.extra.itemRef || a.qid,
        content: q?.extra.word || q?.answer || '',
        detail: q?.extra.pinyin || '',
        correct: a.correct,
      }
    })
    const grade = cfg.grades[quiz.subject === 'zh' ? 'zh' : quiz.subject === 'math' ? 'math' : 'en']
    const res = applyWrongUpdates(quiz.subject, grade, rich)
    return {
      total: answers.length,
      correct: answers.filter((a) => a.correct).length,
      newWrong: res.newWrong,
      graduated: res.graduated,
    }
  },

  async getUserConfig() {
    return getUserConfig()
  },

  async saveUserConfig(c) {
    saveUserConfig(c)
  },
}

// ---------------- V1 云端实现 ----------------

async function callFn<T>(name: string, data: object): Promise<T> {
  const res = await wx.cloud.callFunction({ name, data: data as Record<string, unknown> })
  return res.result as T
}

const CloudImpl: QuizAPI = {
  async genQuiz(params) {
    try {
      return await callFn<Quiz>('genQuiz', params)
    } catch (e) {
      // 云端不可用（未部署/网络异常）→ 降回本地出题，练习不中断
      console.warn('[cloud-api] 云端出题失败，降级本地', e)
      return params.subject === 'math' ? genMathQuiz(params) : genQuizLocal(params)
    }
  },
  async submitResult(quiz, answers) {
    try {
      return await callFn<SubmitSummary>('submitResult', {
        quizId: quiz.quizId,
        subject: quiz.subject,
        style: quiz.style,
        questions: quiz.questions.map((q) => ({
          qid: q.qid,
          itemRef: q.extra.itemRef,
          content: q.extra.word || q.answer,
          detail: q.extra.pinyin || '',
        })),
        answers,
      })
    } catch (e) {
      // 云端提交失败 → 本地错题本兜底（错题绝不丢）
      console.warn('[cloud-api] 云端提交失败，降级本地错题本', e)
      return LocalImpl.submitResult(quiz, answers)
    }
  },
  async getUserConfig() {
    try {
      return await callFn<UserConfig>('userConfig', { action: 'get' })
    } catch (e) {
      console.warn('[cloud-api] 云端配置读取失败，降级本地', e)
      return getUserConfig()
    }
  },
  async saveUserConfig(c) {
    try {
      return await callFn<void>('userConfig', { action: 'save', config: c })
    } catch (e) {
      console.warn('[cloud-api] 云端配置保存失败，降级本地', e)
      saveUserConfig(c)
    }
  },
}

// ---------------- 导出：按 cloudEnabled 切换 ----------------

function impl(): QuizAPI {
  const g = getApp<{ globalData: { cloudEnabled: boolean } }>()
  return g && g.globalData.cloudEnabled ? CloudImpl : LocalImpl
}

export const api = {
  genQuiz: (p: GenQuizParams) => impl().genQuiz(p),
  submitResult: (quiz: Quiz, answers: SubmitAnswers[]) => impl().submitResult(quiz, answers),
  getUserConfig: () => impl().getUserConfig(),
  saveUserConfig: (c: UserConfig) => impl().saveUserConfig(c),
}
