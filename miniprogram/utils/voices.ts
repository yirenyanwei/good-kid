/** 精品音色。中文、英文各用各的，不含大模型音色 */

export interface VoiceOption {
  id: number
  name: string
  desc: string
}

export const ZH_VOICES: VoiceOption[] = [
  { id: 101002, name: '智聆', desc: '通用女声' },
  { id: 101016, name: '智甜', desc: '女童声' },
  { id: 101015, name: '智萌', desc: '男童声' },
  { id: 101001, name: '智瑜', desc: '情感女声' },
  { id: 101055, name: '智付', desc: '通用女声' },
  { id: 101026, name: '智希', desc: '通用女声' },
  { id: 101027, name: '智梅', desc: '通用女声' },
  { id: 101011, name: '智燕', desc: '新闻女声' },
  { id: 101004, name: '智云', desc: '通用男声' },
  { id: 101030, name: '智柯', desc: '通用男声' },
  { id: 101054, name: '智友', desc: '通用男声' },
  { id: 101013, name: '智辉', desc: '新闻男声' },
  { id: 101021, name: '智瑞', desc: '新闻男声' },
]

export const EN_VOICES: VoiceOption[] = [
  { id: 101051, name: 'WeRose', desc: '英文女声' },
  { id: 101050, name: 'WeJack', desc: '英文男声' },
]

export function voiceName(list: VoiceOption[], id: number, fallback: string): string {
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === id) return list[i].name
  }
  return fallback
}
