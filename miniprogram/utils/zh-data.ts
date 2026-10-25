// zh-data.ts —— 语文词库（V0 内置版）
// 数据来源：统编版三年级上册（一类字默写 + 词语表 + 拼音四选一干扰项）
// 与 content/dist 结构一致；云库 db_hanzi / db_word_zh 同构

import { HanziItem, WordZhItem } from './types'

const G = 3
const V = '上' as const

/** 三年级上 一类字（要求会写）。二类字（认读）不进默写卷，暂不收录 */
export const HANZI_LIST: HanziItem[] = [
  // 第 1 单元
  h(1, '晨', 'chén', '晨——早晨的晨'),
  h(1, '绒', 'róng', '绒——绒毛的绒'),
  h(1, '球', 'qiú'),
  h(1, '汉', 'hàn'),
  h(1, '艳', 'yàn'),
  h(1, '服', 'fú'),
  h(1, '装', 'zhuāng'),
  h(1, '静', 'jìng'),
  // 第 2 单元
  h(2, '寒', 'hán'),
  h(2, '径', 'jìng', '径——小径的径'),
  h(2, '菊', 'jú'),
  h(2, '残', 'cán'),
  h(2, '黄', 'huáng'),
  h(2, '层', 'céng'),
  h(2, '丰', 'fēng'),
  h(2, '壮', 'zhuàng'),
  // 第 3 单元
  h(3, '火', 'huǒ'),
  h(3, '柴', 'chái'),
  h(3, '旧', 'jiù'),
  h(3, '裙', 'qún'),
  h(3, '怜', 'lián'),
  h(3, '饿', 'è'),
  h(3, '简', 'jiǎn'),
  h(3, '烛', 'zhú'),
  // 第 4 单元
  h(4, '变', 'biàn'),
  h(4, '汪', 'wāng'),
  h(4, '打', 'dǎ', '打——打扫的打'),
  h(4, '晒', 'shài'),
  h(4, '坐', 'zuò'),
  h(4, '呼', 'hū'),
  h(4, '圈', 'quān', '圈——圆圈的圈'),
  h(4, '嘴', 'zuǐ'),
  // 第 5 单元
  h(5, '搭', 'dā'),
  h(5, '亲', 'qīn'),
  h(5, '父', 'fù'),
  h(5, '沙', 'shā'),
  h(5, '响', 'xiǎng'),
  h(5, '羽', 'yǔ'),
  h(5, '翠', 'cuì'),
  h(5, '嘴2', 'zuǐ'),
  // 第 6 单元
  h(6, '宝', 'bǎo'),
  h(6, '贵', 'guì'),
  h(6, '挡', 'dǎng'),
  h(6, '视', 'shì'),
  h(6, '线', 'xiàn'),
  h(6, '材', 'cái'),
  h(6, '软', 'ruǎn'),
  h(6, '刮', 'guā', '刮——刮风的刮'),
  // 第 7 单元
  h(7, '奏', 'zòu'),
  h(7, '琴', 'qín'),
  h(7, '感', 'gǎn'),
  h(7, '受', 'shòu'),
  h(7, '激', 'jī'),
  h(7, '击', 'jī'),
  h(7, '器', 'qì'),
  h(7, '滴', 'dī'),
  // 第 8 单元
  h(8, '矛', 'máo'),
  h(8, '盾', 'dùn'),
  h(8, '集', 'jí'),
  h(8, '般', 'bān'),
  h(8, '架', 'jià'),
  h(8, '龟', 'guī'),
  h(8, '猛', 'měng'),
  h(8, '烈', 'liè'),
]

function h(unit: number, hanzi: string, pinyin: string, speakText?: string): HanziItem {
  return {
    id: `zh-${G}-${V}-u${unit}-${hanzi}`,
    grade: G,
    volume: V,
    unit,
    hanzi,
    pinyin,
    klass: 1,
    ...(speakText ? { speakText } : {}),
  }
}

/** 三年级上 词语表（整词听写用，来源=课本词语表，不挖空） */
export const WORD_ZH_LIST: WordZhItem[] = [
  w(1, '早晨', 'zǎo chén'),
  w(1, '穿戴', 'chuān dài'),
  w(1, '鲜艳', 'xiān yàn'),
  w(1, '服装', 'fú zhuāng'),
  w(1, '安静', 'ān jìng'),
  w(2, '金色', 'jīn sè'),
  w(2, '菊花', 'jú huā'),
  w(2, '礼物', 'lǐ wù'),
  w(2, '丰富多彩', 'fēng fù duō cǎi'),
  w(2, '层林尽染', 'céng lín jìn rǎn'),
  w(3, '火柴', 'huǒ chái'),
  w(3, '围裙', 'wéi qún'),
  w(3, '可怜', 'kě lián'),
  w(3, '又冷又饿', 'yòu lěng yòu è'),
  w(3, '烛光', 'zhú guāng'),
  w(4, '变化', 'biàn huà'),
  w(4, '打扫', 'dǎ sǎo'),
  w(4, '晒太阳', 'shài tài yáng'),
  w(4, '呼呼地', 'hū hū de'),
  w(5, '搭船', 'dā chuán'),
  w(5, '父亲', 'fù qīn'),
  w(5, '沙啦', 'shā lā'),
  w(5, '羽毛', 'yǔ máo'),
  w(5, '翠鸟', 'cuì niǎo'),
  w(6, '宝贵', 'bǎo guì'),
  w(6, '挡住', 'dǎng zhù'),
  w(6, '视线', 'shì xiàn'),
  w(6, '软绵绵', 'ruǎn mián mián'),
  w(7, '演奏', 'yǎn zòu'),
  w(7, '感受', 'gǎn shòu'),
  w(7, '激动', 'jī dòng'),
  w(7, '打击乐器', 'dǎ jī yuè qì'),
  w(8, '集合', 'jí hé'),
  w(8, '一般', 'yì bān'),
  w(8, '架子', 'jià zi'),
  w(8, '乌龟', 'wū guī'),
  w(8, '猛烈', 'měng liè'),
]

function w(unit: number, word: string, pinyin: string): WordZhItem {
  return {
    id: `zw-${G}-${V}-u${unit}-${word}`,
    grade: G,
    volume: V,
    unit,
    word,
    pinyin,
    chars: word.split('').map((c) => ({ c, writable: true })),
  }
}

/** 全部词条总数（参数页展示用） */
export function zhDataStats(): { hanzi: number; words: number; units: number } {
  const units = new Set<number>()
  HANZI_LIST.forEach((x) => units.add(x.unit))
  return { hanzi: HANZI_LIST.length, words: WORD_ZH_LIST.length, units: units.size }
}
