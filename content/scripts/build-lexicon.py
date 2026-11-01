# -*- coding: utf-8 -*-
"""
build-lexicon.py —— 词库单一真源构建脚本

用法：python3 content/scripts/build-lexicon.py

输入：content/lexicon/hanzi-3a.csv（Excel 可直接编辑，另存 CSV UTF-8）
  列：unit,source,hanzi,pinyin,words（组词用 | 分隔，3-5 个）

输出（三端自动同步）：
  1. miniprogram/utils/zh-data.ts          前端 HANZI_LIST（保留 WORD_ZH_LIST 尾部）
  2. cloudfunctions/genQuiz/data/hanzi.js  云函数词库
  3. content/dist/db_hanzi.json            云数据库导入文件

校验规则（数据坏在源头就拦截）：
  - unit 1-8 整数；source ∈ {lesson, garden}
  - 拼音格式：声母(可选)+韵母+声调字符(1-5 之一, 轻声 5 或无声调)
  - 字去重（同字不允许出现两次）
  - 每个组词必须包含目标字；组词去重；长度 ≤6；数量 1-6
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent  # 项目根
CSV_PATH = ROOT / "content/lexicon/hanzi-3a.csv"
TS_PATH = ROOT / "miniprogram/utils/zh-data.ts"
JS_PATH = ROOT / "cloudfunctions/genQuiz/data/hanzi.js"
DB_PATH = ROOT / "content/dist/db_hanzi.json"

G, V = 3, "上"
TONE_CHARS = set("āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüńňǹ")
PINYIN_RE = re.compile(r"^[a-zü]+([āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜü]+|[1-5])?$")

errors = []


def check(cond, msg):
    if not cond:
        errors.append(msg)


def load_csv():
    rows = []
    with open(CSV_PATH, encoding="utf-8-sig") as f:  # utf-8-sig 兼容 Excel BOM
        reader = csv.DictReader(f)
        for i, r in enumerate(reader, start=2):  # 第 2 行起是数据（1 行表头）
            hanzi = (r.get("hanzi") or "").strip()
            unit_raw = (r.get("unit") or "").strip()
            source = (r.get("source") or "lesson").strip()
            pinyin = (r.get("pinyin") or "").strip()
            words_raw = (r.get("words") or "").strip()
            check(len(hanzi) == 1, f"行{i}: hanzi 必须单个字，得「{hanzi}」")
            check(unit_raw.isdigit() and 1 <= int(unit_raw) <= 8, f"行{i} {hanzi}: unit 非法「{unit_raw}」")
            check(source in ("lesson", "garden"), f"行{i} {hanzi}: source 非法「{source}」")
            # 拼音两种合法形态：带调（chén）或数字调（chen2）
            if pinyin:
                has_tone = any(c in TONE_CHARS for c in pinyin)
                has_digit = pinyin[-1].isdigit()
                all_ascii = all(c.isascii() and c.isalpha() for c in pinyin)
                check(has_tone or (has_digit and all_ascii) or pinyin in ("a", "o", "e", "la", "de"),
                      f"行{i} {hanzi}: pinyin 格式异常「{pinyin}」")
            words = [w.strip() for w in words_raw.split("|") if w.strip()]
            check(len(words) >= 1, f"行{i} {hanzi}: 组词为空")
            check(len(words) <= 6, f"行{i} {hanzi}: 组词超过 6 个")
            for w in words:
                check(hanzi in w, f"行{i} {hanzi}: 组词「{w}」不含目标字")
                check(len(w) <= 6, f"行{i} {hanzi}: 组词「{w}」超长")
            check(len(set(words)) == len(words), f"行{i} {hanzi}: 组词重复")
            rows.append({
                "unit": int(unit_raw), "source": source, "hanzi": hanzi,
                "pinyin": pinyin, "words": words,
            })
    # 字去重
    seen = {}
    for r in rows:
        check(r["hanzi"] not in seen, f"字重复: {r['hanzi']}（u{seen.get(r['hanzi'])} 与 u{r['unit']}）")
        seen[r["hanzi"]] = r["unit"]
    return rows


def gen_ts(rows):
    """生成 zh-data.ts 的 HANZI_LIST 头部，拼接原 WORD_ZH_LIST 尾部"""
    lines = []
    cur = None
    for r in rows:
        key = (r["unit"], r["source"])
        if key != cur:
            cur = key
            if r["source"] == "garden":
                lines.append(f"  // 第 {cur[0]} 单元（语文园地）")
            else:
                lines.append(f"  // 第 {cur[0]} 单元")
        words = ", ".join("'" + w + "'" for w in r["words"])
        lines.append(f"  h({r['unit']}, '{r['hanzi']}', '{r['pinyin']}', [{words}], '{r['source']}'),")
    head = """// zh-data.ts —— 语文词库（本文件由 content/scripts/build-lexicon.py 生成，勿手改）
// 数据源（单一真源）：content/lexicon/hanzi-3a.csv（Excel 编辑后另存 CSV UTF-8，跑脚本重新生成）
// 统编版三年级上册 2024 秋版：课文写字表 249 字 + 语文园地 33 字
// 每字 3-5 组词随机报（X——XX的X）；云库 db_hanzi 同构

import { HanziItem, WordZhItem } from './types'

const G = 3
const V = '上' as const

/** 三年级上 一类字（要求会写）。语文园地识字加油站字标记 source='garden' */
export const HANZI_LIST: HanziItem[] = [
""" + "\n".join(lines) + """
]

function h(unit: number, hanzi: string, pinyin: string, words: string[], source: 'lesson' | 'garden'): HanziItem {
  return {
    id: `zh-${G}-${V}-u${unit}-${hanzi}`,
    grade: G,
    volume: V,
    unit,
    hanzi,
    pinyin,
    klass: 1,
    source,
    words,
  }
}
"""
    # 拼接原文件 WORD_ZH_LIST 部分（词库走 WORD_ZH_LIST 的 CSV 时再重构）
    old = TS_PATH.read_text(encoding="utf-8")
    marker = "/** 三年级上 词语表（整词听写用，来源=课本词语表，不挖空） */"
    idx = old.index(marker)
    TS_PATH.write_text(head + "\n" + old[idx:], encoding="utf-8")


def gen_js(rows):
    items = []
    cur = None
    for r in rows:
        key = (r["unit"], r["source"])
        if key != cur:
            cur = key
            if r["source"] == "garden":
                items.append(f"  // 第 {r['unit']} 单元（语文园地）")
            else:
                items.append(f"  // 第 {r['unit']} 单元")
        words = ", ".join("'" + w + "'" for w in r["words"])
        items.append(
            "  { id: 'zh-3-上-u%d-%s', grade: 3, volume: '上', unit: %d, hanzi: '%s', pinyin: '%s', klass: 1, source: '%s', words: [%s] },"
            % (r["unit"], r["hanzi"], r["unit"], r["hanzi"], r["pinyin"], r["source"], words)
        )
    js = """// 云函数 genQuiz 词库（本文件由 content/scripts/build-lexicon.py 生成，勿手改）
// 数据源：content/lexicon/hanzi-3a.csv；正式版导入 db_hanzi 后本文件仅作冷启动兜底
module.exports = [
""" + "\n".join(items) + """
]
"""
    JS_PATH.write_text(js, encoding="utf-8")


def gen_db(rows):
    data = []
    for r in rows:
        data.append({
            "_id": "zh-3-shang-u%d-%s" % (r["unit"], r["hanzi"]),
            "grade": G, "volume": V, "unit": r["unit"],
            "hanzi": r["hanzi"], "pinyin": r["pinyin"],
            "klass": 1, "source": r["source"], "words": r["words"],
        })
    DB_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


def main():
    if not CSV_PATH.exists():
        print("找不到 CSV:", CSV_PATH)
        sys.exit(1)
    rows = load_csv()
    if errors:
        print("校验失败，%d 个错误：" % len(errors))
        for e in errors:
            print("  ✗", e)
        sys.exit(1)
    gen_ts(rows)
    gen_js(rows)
    gen_db(rows)
    garden = sum(1 for r in rows if r["source"] == "garden")
    wc = [len(r["words"]) for r in rows]
    print("✓ 构建成功：%d 字（园地 %d）· 组词均 %.1f 个" % (len(rows), garden, sum(wc) / len(wc)))
    print("  → zh-data.ts / hanzi.js / db_hanzi.json 三端已同步")


if __name__ == "__main__":
    main()
