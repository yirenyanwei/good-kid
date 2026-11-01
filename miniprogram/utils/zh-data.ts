// zh-data.ts —— 语文词库薄层（本文件由 content/scripts/build-config.py 生成，勿手改）
// 数据源（单一真源）：content/lexicon/*.csv → content/dist 同一份 config.json
// 前后端加载同一份字节（云函数：cloudfunctions/genQuiz/data/config.json）
// 修改词库：Excel 编辑 CSV → 跑 python3 content/scripts/build-config.py → 重新部署云函数

import { HanziItem, WordZhItem } from './types'
import raw from './config.json'

interface ConfigRow {
  id: string
  unit: number
  hanzi?: string
  word?: string
  pinyin?: string
  source?: 'lesson' | 'garden'
  words?: string[]
}

interface ConfigFile {
  version: string
  tables: { 'hanzi-3a': ConfigRow[]; 'word-zh': ConfigRow[] }
}

const G = 3
const V = '上' as const

const config = raw as ConfigFile
const hanziRows = config.tables['hanzi-3a']
const wordRows = config.tables['word-zh']

/** 三年级上 一类字（要求会写）。语文园地识字加油站字标记 source='garden' */
export const HANZI_LIST: HanziItem[] = hanziRows.map((r) => ({
  id: r.id,
  grade: G,
  volume: V,
  unit: r.unit,
  hanzi: r.hanzi ?? '',
  pinyin: r.pinyin ?? '',
  klass: 1,
  source: r.source ?? 'lesson',
  words: r.words ?? [],
}))

/** 三年级上 词语表（整词听写用，来源=课本词语表，不挖空） */
export const WORD_ZH_LIST: WordZhItem[] = wordRows.map((r) => ({
  id: r.id,
  grade: G,
  volume: V,
  unit: r.unit,
  word: r.word ?? '',
  pinyin: r.pinyin ?? '',
  chars: (r.word ?? '').split('').map((c) => ({ c, writable: true })),
}))

/** 配置版本（数据变更指纹，排查前后端是否同源时比对用） */
export const CONFIG_VERSION = config.version

/** 全部词条总数（参数页展示用） */
export function zhDataStats(): { hanzi: number; words: number; units: number } {
  const units = new Set<number>()
  HANZI_LIST.forEach((x) => units.add(x.unit))
  return { hanzi: HANZI_LIST.length, words: WORD_ZH_LIST.length, units: units.size }
}
