// storage.ts —— 本地存储（V0 数据层：用户配置 / 错题本 / 练习日志 / 断点草稿）
// 键命名与云数据库集合一一对应，切云时按同构迁移

import { UserConfig, WrongItem, QuizLog, Subject } from './types'

const K_CONFIG = 'gk_user_config'
const K_WRONG = 'gk_wrong_book'
const K_LOGS = 'gk_quiz_logs'
const K_DRAFT = 'gk_dictate_draft' // 默写页防误退草稿（进行中标记）

const DEFAULT_CONFIG: UserConfig = {
  grades: { zh: 3, math: 3, en: 3 },
  volume: '上',
  speed: 'normal',
  weightedQuiz: true,
}

export function getUserConfig(): UserConfig {
  const c = wx.getStorageSync<UserConfig>(K_CONFIG)
  if (!c || !c.grades) {
    saveUserConfig(DEFAULT_CONFIG)
    return DEFAULT_CONFIG
  }
  return c
}

export function saveUserConfig(c: UserConfig): void {
  wx.setStorageSync(K_CONFIG, c)
}

export function getWrongItems(): WrongItem[] {
  return wx.getStorageSync<WrongItem[]>(K_WRONG) || []
}

export function getWrongItemsBySubject(subject: Subject): WrongItem[] {
  return getWrongItems().filter((w) => w.subject === subject)
}

function saveWrongItems(items: WrongItem[]): void {
  wx.setStorageSync(K_WRONG, items)
}

/**
 * 提交一轮答案的本地错题本更新。
 * 毕业规则（架构文档 §四）：wrongCount≥3 后连对 2 次 → mastered。
 */
export function applyWrongUpdates(
  subject: Subject,
  grade: number,
  answers: { itemRef: string; content: string; detail: string; correct: boolean }[]
): { newWrong: string[]; graduated: string[] } {
  const items = getWrongItems()
  const map = new Map(items.map((w) => [w.itemRef, w]))
  const newWrong: string[] = []
  const graduated: string[] = []

  for (const a of answers) {
    const existing = map.get(a.itemRef)
    if (a.correct) {
      if (existing) {
        existing.streakRight += 1
        if (existing.wrongCount >= 3 && existing.streakRight >= 2 && !existing.mastered) {
          existing.mastered = true
          graduated.push(a.itemRef)
        }
      }
    } else {
      if (existing) {
        existing.wrongCount += 1
        existing.streakRight = 0
        existing.mastered = false
        existing.lastWrongTs = Date.now()
      } else {
        map.set(a.itemRef, {
          itemRef: a.itemRef,
          subject,
          grade,
          content: a.content,
          detail: a.detail,
          wrongCount: 1,
          streakRight: 0,
          mastered: false,
          lastWrongTs: Date.now(),
        })
        newWrong.push(a.itemRef)
      }
    }
  }
  saveWrongItems([...map.values()])
  return { newWrong, graduated }
}

export function clearWrongDraft(): void {
  wx.removeStorageSync(K_DRAFT)
}

export function setDictateDraft(quizId: string, subject: Subject): void {
  wx.setStorageSync(K_DRAFT, { quizId, subject, ts: Date.now() })
}

export function getDictateDraft(): { quizId: string; subject: Subject; ts: number } | null {
  return wx.getStorageSync<{ quizId: string; subject: Subject; ts: number }>(K_DRAFT) || null
}

export function appendQuizLog(log: QuizLog): void {
  const logs = wx.getStorageSync<QuizLog[]>(K_LOGS) || []
  logs.push(log)
  // 只保留最近 60 条
  wx.setStorageSync(K_LOGS, logs.slice(-60))
}

export function getQuizLogs(): QuizLog[] {
  return wx.getStorageSync<QuizLog[]>(K_LOGS) || []
}

/** 周报四指标（本地版：从日志聚合） */
export function weeklyStats(): { count: number; correctRate: number; killed: number; days: number } {
  const logs = getQuizLogs()
  const weekAgo = Date.now() - 7 * 86400_000
  const recent = logs.filter((l) => l.ts >= weekAgo)
  const total = recent.reduce((s, l) => s + l.total, 0)
  const correct = recent.reduce((s, l) => s + l.correct, 0)
  const daySet = new Set(recent.map((l) => new Date(l.ts).toDateString()))
  const killed = recent.reduce((s, l) => s + (l.total - l.correct), 0)
  return {
    count: recent.length,
    correctRate: total > 0 ? Math.round((correct / total) * 100) : 0,
    killed,
    days: daySet.size,
  }
}
