// types.ts —— 三科统一题目抽象（与云函数入参出参完全一致）
// 架构文档 §四：题目 = { subject, type, prompt, answer, extra }

/** 学科 */
export type Subject = 'zh' | 'math' | 'en'

/** 题型渲染器：dictate 报词 / input 数字键盘 / choice 四选一 */
export type QuizType = 'dictate' | 'input' | 'choice'

/** 语文练习样式（学科二级页入口） */
export type ZhStyle = 'hanzi-dictate' | 'word-dictate' | 'pinyin-choice'

/** 汉字词条（db_hanzi / 本地 fallback 同构） */
export interface HanziItem {
  id: string
  grade: number
  volume: '上' | '下'
  unit: number
  hanzi: string
  pinyin: string
  /** 一类字（会写）或二类字（认读）；二类字默认不进默写卷 */
  klass?: 1 | 2
  /** 词条来源：课文 lesson / 语文园地 garden */
  source?: 'lesson' | 'garden'
  /** 组词表（报词随机选一个，加深组词记忆）；每词必须包含目标字 */
  words?: string[]
  /** 兼容旧字段：多音字播报串（有 words 时优先 words） */
  speakText?: string
}

/** 词语词条（db_word_zh / 本地 fallback 同构） */
export interface WordZhItem {
  id: string
  grade: number
  volume: '上' | '下'
  unit: number
  /** 整词，如 "五彩斑斓" */
  word: string
  pinyin: string
  chars: { c: string; writable: boolean }[]
}

/** 统一题目 */
export interface Question {
  qid: string
  subject: Subject
  type: QuizType
  /** dictate: 提示文案("第 3 个词")由端上生成；choice: 拼音；input: 算式 */
  prompt: string
  answer: string
  extra: {
    /** 词条引用 id（错题 itemRef） */
    itemRef?: string
    /** TTS 播报文本（多音字消歧后） */
    speakText?: string
    /** 词语听写：整词展示用 */
    word?: string
    pinyin?: string
    /** choice：选项数组（已乱序） */
    options?: string[]
    /** 题目来源：错题重练标记 */
    fromWrong?: boolean
  }
}

/** 出题入参 */
export interface GenQuizParams {
  subject: Subject
  style?: ZhStyle
  grade: number
  volume: '上' | '下'
  mode: 'random' | 'unit'
  unit?: number
  count: number
}

/** 出题结果 */
export interface Quiz {
  quizId: string
  subject: Subject
  style?: ZhStyle
  questions: Question[]
}

/** 判题入参 */
export interface SubmitAnswers {
  qid: string
  correct: boolean
}

export interface SubmitSummary {
  total: number
  correct: number
  /** 新入库错题 itemRef 列表 */
  newWrong: string[]
  /** 本轮毕业 itemRef 列表 */
  graduated: string[]
}

/** 用户配置 */
export interface UserConfig {
  grades: { zh: number; math: number; en: number }
  volume: '上' | '下'
  speed: 'slow' | 'normal' | 'fast'
  weightedQuiz: boolean
}

/** 错题本条目 */
export interface WrongItem {
  itemRef: string
  subject: Subject
  grade: number
  content: string
  detail: string
  wrongCount: number
  streakRight: number
  mastered: boolean
  lastWrongTs: number
}

/** 练习日志（用于周报 / 昨日续练） */
export interface QuizLog {
  quizId: string
  subject: Subject
  style?: ZhStyle
  correct: number
  total: number
  duration: number
  ts: number
}
