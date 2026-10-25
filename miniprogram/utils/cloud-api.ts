// cloud-api.ts —— 云函数调用统一封装（request 层）
// V0 LocalImpl：词库本地、出题端上、错题本 storage
// V1 CloudImpl：wx.cloud.callFunction（入参出参与本地完全一致，切换只换实现类）

import { GenQuizParams, Quiz, SubmitAnswers, SubmitSummary, UserConfig } from './types'
import { genQuizLocal } from './quiz-engine'
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
    const res = applyWrongUpdates(quiz.subject, cfg.grades.zh, rich)
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
    return callFn<Quiz>('genQuiz', params)
  },
  async submitResult(quiz, answers) {
    return callFn<SubmitSummary>('submitResult', {
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
  },
  async getUserConfig() {
    return callFn<UserConfig>('userConfig', { action: 'get' })
  },
  async saveUserConfig(c) {
    return callFn<void>('userConfig', { action: 'save', config: c })
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
