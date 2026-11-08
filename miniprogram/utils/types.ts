// types.ts —— 三科统一题目抽象（与云函数入参出参完全一致）
// 架构文档 §四：题目 = { subject, type, prompt, answer, extra }

/** 学科 */
export type Subject = 'zh' | 'math' | 'en'

/** 题型渲染器：dictate 报词 / input 数字键盘 / choice 四选一 */
export type QuizType = 'dictate' | 'input' | 'choice'

/** 语文练习样式（学科二级页入口） */
export type ZhStyle = 'hanzi-dictate' | 'word-dictate' | 'pinyin-choice'

/** 数学练习样式：口算单步 / 加减乘除混合运算 */
export type MathStyle = 'math-calc' | 'math-mixed'

/** 英语练习样式：单词默写（听英文+中文释义，纸上写单词） */
export type EnStyle = 'word-en-dictate'

/** 口算运算符（可多选） */
export type MathOp = 'add' | 'sub' | 'mul' | 'div'

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

/** 英语单词（人教 PEP 三年级上，本地 fallback 与云端 config 同构） */
export interface WordEnItem {
  id: string
  grade: number
  volume: '上' | '下'
  unit: number
  word: string
  /** 中文释义（默写页给家长看，TTS 报首项） */
  meaning: string
  phonetic: string
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
    /** 词语听写：整词展示用；英语默写：英文单词 */
    word?: string
    pinyin?: string
    /** 英语默写：中文释义（家长对答案用） */
    meaning?: string
    /** choice：选项数组（已乱序） */
    options?: string[]
    /** 题目来源：错题重练标记 */
    fromWrong?: boolean
  }
}

/** 出题入参 */
export interface GenQuizParams {
  subject: Subject
  style?: ZhStyle | MathStyle | EnStyle
  grade: number
  volume: '上' | '下'
  mode: 'random' | 'unit'
  unit?: number
  count: number
  /** 数学：口算勾选的运算符（math-calc 用） */
  ops?: MathOp[]
}

/** 出题结果 */
export interface Quiz {
  quizId: string
  subject: Subject
  style?: ZhStyle | MathStyle | EnStyle
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

/** 某一科的发音：语速和音色分开记，中英文音色不能混用 */
export interface SpeechPref {
  speed: 'slow' | 'normal' | 'fast'
  /** 腾讯云精品音色 VoiceType */
  voice: number
}

/** 用户配置 */
export interface UserConfig {
  grades: { zh: number; math: number; en: number }
  volume: '上' | '下'
  /** 旧字段，与 speechZh.speed 保持一致 */
  speed: 'slow' | 'normal' | 'fast'
  speechZh: SpeechPref
  speechEn: SpeechPref
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
  style?: ZhStyle | MathStyle | EnStyle
  correct: number
  total: number
  duration: number
  ts: number
}
