// en-data.ts —— 英语词库薄层（数据在 config.ts，由 data/csvs/word-en.csv 构建）
// 修改词库：Excel 编辑 CSV → python3 data/scripts/build-config.py → 重新部署云函数 genQuiz

import { WordEnItem } from './types'
import { CONFIG } from './config'

interface EnRow {
  id: string
  unit: number
  word?: string
  meaning?: string
  phonetic?: string
}

interface EnConfig {
  tables: { 'word-en': EnRow[] }
}

const G = 3
const V = '上' as const

const config = CONFIG as unknown as EnConfig
const wordRows = config.tables['word-en'] || []

/** 人教 PEP 三年级起点 · 2024 新教材三年级上册单词表 */
export const WORD_EN_LIST: WordEnItem[] = wordRows.map((r) => ({
  id: r.id,
  grade: G,
  volume: V,
  unit: r.unit,
  word: r.word ?? '',
  meaning: r.meaning ?? '',
  phonetic: r.phonetic ?? '',
}))

export function enDataStats(): { words: number; units: number } {
  const units = new Set<number>()
  WORD_EN_LIST.forEach((x) => units.add(x.unit))
  return { words: WORD_EN_LIST.length, units: units.size }
}
