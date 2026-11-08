# -*- coding: utf-8 -*-
"""
build-config.py —— 配置单一真源构建（通用引擎 + 按表校验）

用法：python3 data/scripts/build-config.py

输入：data/csvs/*.csv，四段式结构：
  行1  列名（必须含 id 列，id 为表内主键）
  行2  类型 DSL：string / number / array(string|number) / array(array(string|number))
      一维按 | 分隔，二维外层 | 内层 ,（最多二维）
  行3  注释（禁逗号；只给人看，不参与逻辑与 hash）
  行4+ 数据（单元格空 = 该字段缺省；id 列空则报错）

输出：
  1. miniprogram/utils/config.ts              前端加载（zh-data.ts 薄层 import；小程序运行时
                                             不支持 require('*.json')，前端产物必须是 ts/js）
  2. cloudfunctions/genQuiz/data/config.json  云函数 require（与前端同一份字节）
  3. data/scripts/id-snapshot.json            id 防改绑快照（请提交进 git）

（历史：曾产出 data/dist/db_hanzi.json 云数据库导入文件，genQuiz 现直读内置
 config.json，该产物已废弃；将来切云数据库时再恢复即可）

version 由全部表内容 hash 自动生成（v-日期-4位hex），内容一变版本必变。

架构分层：
  - CSV 类型行   管「怎么解析」（引擎通用，零业务）
  - TABLE_RULES  管「什么算对」（业务规则，按表注册；新表=新函数，引擎不动）
  - id 快照      管「别改绑」（错题本 itemRef 跨版本持久化的安全网）

id 纪律（人工维护时务必遵守，脚本快照会拦截违规）：
  - 表内唯一；分配后永不改绑到别的行、永不复用
  - 改错字 = 删旧行 + 加新行（新 id）；插行 = 新 id，不动已有 id
"""
import csv
import hashlib
import json
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
LEXICON = ROOT / "data/csvs"
FRONT_TS = ROOT / "miniprogram/utils/config.ts"
CLOUD_JSON = ROOT / "cloudfunctions/genQuiz/data/config.json"
SNAPSHOT = ROOT / "data/scripts/id-snapshot.json"

G, V = 3, "上"
TONE_CHARS = set("āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜüńňǹ")

TYPE_RE = re.compile(r"^array\((array\((?:string|number)\)|(?:string|number))\)$")
NUM_RE = re.compile(r"^-?\d+$")

errors = []


def check(cond, msg):
    if not cond:
        errors.append(msg)


# ---------- 类型引擎（通用，零业务） ----------

def parse_type(t):
    t = t.strip()
    if t in ("string", "number"):
        return t
    if TYPE_RE.match(t):
        return t
    return None


def convert(t, raw, where):
    """按类型 DSL 把单元格字符串转为 JSON 值"""
    s = raw.strip()
    if t == "string":
        return s
    if t == "number":
        ok = NUM_RE.match(s) is not None
        check(ok, f"{where}: number 列得到「{s}」")
        return int(s) if ok else s
    inner = t[len("array("):-1]
    if inner in ("string", "number"):  # 一维
        parts = [p.strip() for p in s.split("|") if p.strip()]
        return [convert(inner, p, where) for p in parts]
    # 二维：外层 | 内层 ,
    sub = inner[len("array("):-1]
    groups = [g.strip() for g in s.split("|") if g.strip()]
    return [[convert(sub, c.strip(), where) for c in g.split(",") if c.strip()] for g in groups]


def load_table(path):
    """读一张表：结构校验 + 类型转换。返回 [(行号, {列:值}), ...] 或 None（结构烂）"""
    name = path.stem
    with open(path, encoding="utf-8-sig", newline="") as f:
        rows = [r for r in csv.reader(f)]
    while rows and all(not c.strip() for c in rows[-1]):  # 去尾部空行
        rows.pop()

    check(len(rows) >= 4, f"[{name}] 行数 {len(rows)} 不足（需 列名/类型/注释/至少1行数据）")
    if len(rows) < 4:
        return None

    cols = [c.strip() for c in rows[0]]
    check(all(cols), f"[{name}] 行1存在空列名")
    check(len(set(cols)) == len(cols), f"[{name}] 列名重复")
    check("id" in cols, f"[{name}] 缺 id 列")

    types_raw = [c.strip() for c in rows[1]]
    check(len(types_raw) == len(cols), f"[{name}] 行2列数 {len(types_raw)} ≠ {len(cols)}（类型行被截断？）")
    types = {}
    for c, t in zip(cols, types_raw):
        tt = parse_type(t)
        check(tt is not None, f"[{name}] 列「{c}」类型非法「{t}」（合法：string/number/array(...)）")
        types[c] = tt or "string"

    notes = rows[2]
    check(len(notes) == len(cols), f"[{name}] 行3列数 {len(notes)} ≠ {len(cols)}（注释行误删或含未加引号的逗号）")
    for c, n in zip(cols, notes):
        check("," not in n, f"[{name}] 注释「{n}」含逗号（Excel 引号雷区，请改用 、 或空格）")

    out = []
    for i, r in enumerate(rows[3:], start=4):
        if not any(c.strip() for c in r):  # 中部空行跳过
            continue
        check(len(r) == len(cols), f"[{name}] 行{i} 列数 {len(r)} ≠ {len(cols)}")
        if len(r) != len(cols):
            continue
        row = {}
        for c, raw in zip(cols, r):
            s = raw.strip()
            if s == "":
                if c == "id":
                    check(False, f"[{name}] 行{i}: id 不能为空")
                continue  # 空单元格 = 缺省，产物省略该键
            row[c] = convert(types[c], s, f"[{name}] 行{i} 列「{c}」")
        out.append((i, row))
    return out


# ---------- 业务校验（按表注册，引擎不含业务） ----------

def validate_hanzi(name, rows):
    """hanzi-3a：三年级上册生字表"""
    seen_hanzi, seen_id = {}, set()
    for i, r in rows:
        hz, pid = r.get("hanzi", ""), r.get("pinyin", "")
        unit, src = r.get("unit"), r.get("source", "lesson")
        words = r.get("words", [])
        rid = r.get("id", "")
        check(len(hz) == 1, f"[{name}] 行{i}: hanzi 必须单个字，得「{hz}」")
        check(isinstance(unit, int) and 1 <= unit <= 8, f"[{name}] 行{i} {hz}: unit 非法「{unit}」")
        check(src in ("lesson", "garden"), f"[{name}] 行{i} {hz}: source 非法「{src}」")
        # 拼音两种合法形态：带调（chén）或数字调（chen2）；轻声词兜底
        if pid:
            has_tone = any(c in TONE_CHARS for c in pid)
            has_digit = pid[-1].isdigit()
            all_ascii = all(c.isascii() and c.isalpha() for c in pid)
            check(has_tone or (has_digit and all_ascii) or pid in ("a", "o", "e", "la", "de"),
                  f"[{name}] 行{i} {hz}: pinyin 格式异常「{pid}」")
        check(1 <= len(words) <= 6, f"[{name}] 行{i} {hz}: 组词数量 {len(words)} 越界（1-6）")
        for w in words:
            check(hz in w, f"[{name}] 行{i} {hz}: 组词「{w}」不含目标字")
            check(len(w) <= 6, f"[{name}] 行{i} {hz}: 组词「{w}」超长")
        check(len(set(words)) == len(words), f"[{name}] 行{i} {hz}: 组词重复")
        check(rid not in seen_id, f"[{name}] 行{i}: id 重复「{rid}」")
        seen_id.add(rid)
        check(hz not in seen_hanzi, f"[{name}]: 字重复 {hz}（u{seen_hanzi.get(hz)} 与 行{i}）")
        seen_hanzi[hz] = unit
        check(rid == f"zh-{G}-{V}-u{unit}-{hz}", f"[{name}] 行{i}: id「{rid}」与 unit/hanzi 对不上")


def validate_wordzh(name, rows):
    """word-zh：三年级上册词语表"""
    seen_word, seen_id = set(), set()
    for i, r in rows:
        word, pid = r.get("word", ""), r.get("pinyin", "")
        unit = r.get("unit")
        rid = r.get("id", "")
        check(isinstance(unit, int) and 1 <= unit <= 8, f"[{name}] 行{i} {word}: unit 非法「{unit}」")
        check(2 <= len(word) <= 6, f"[{name}] 行{i}: word 长度越界「{word}」")
        check(bool(pid.strip()), f"[{name}] 行{i} {word}: pinyin 为空")
        check(rid not in seen_id, f"[{name}] 行{i}: id 重复「{rid}」")
        seen_id.add(rid)
        check(word not in seen_word, f"[{name}]: 词语重复 {word}")
        seen_word.add(word)
        check(rid == f"zw-{G}-{V}-u{unit}-{word}", f"[{name}] 行{i}: id「{rid}」与 unit/word 对不上")


# 单词：字母开头，允许内部撇号（don't / o'clock）和空格短语（red panda）
WORD_EN_RE = re.compile(r"^[A-Za-z]+(?:'[A-Za-z]+)?(?: [A-Za-z]+(?:'[A-Za-z]+)?)*$")


def validate_worden(name, rows):
    """word-en：人教 PEP 三年级上册单词表（可枚举，跟语文一样配表）"""
    seen_id, seen_key = set(), set()
    for i, r in rows:
        word = r.get("word", "")
        meaning, phonetic = r.get("meaning", ""), r.get("phonetic", "")
        unit = r.get("unit")
        rid = r.get("id", "")
        check(isinstance(unit, int) and 1 <= unit <= 6, f"[{name}] 行{i} {word}: unit 非法「{unit}」")
        check(bool(WORD_EN_RE.match(word)), f"[{name}] 行{i}: word 非法「{word}」")
        check(1 <= len(word) <= 20, f"[{name}] 行{i}: word 长度越界「{word}」")
        check(bool(meaning.strip()), f"[{name}] 行{i} {word}: meaning 为空")
        check(bool(phonetic.strip()), f"[{name}] 行{i} {word}: phonetic 为空")
        check(rid not in seen_id, f"[{name}] 行{i}: id 重复「{rid}」")
        seen_id.add(rid)
        key = (unit, word)
        check(key not in seen_key, f"[{name}]: 同单元单词重复 u{unit} {word}")
        seen_key.add(key)
        check(rid == f"en-{G}-{V}-u{unit}-{word}", f"[{name}] 行{i}: id「{rid}」与 unit/word 对不上")


TABLE_RULES = {
    "hanzi-3a": validate_hanzi,
    "word-zh": validate_wordzh,
    "word-en": validate_worden,
}


# ---------- id 防改绑快照 ----------

def row_fingerprint(r):
    """身份字段（改这些=改绑）；改拼音/组词等非身份字段不算改绑"""
    identity = r.get("hanzi") or r.get("word") or ""
    return f"{identity}|u{r.get('unit')}"


def check_rebind(tables):
    if not SNAPSHOT.exists():
        return 0, 0
    old = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    removed = 0
    for name, rows in tables.items():
        old_ids = old.get(name, {})
        current = {}
        for i, r in rows:
            rid = r.get("id", "")
            current[rid] = row_fingerprint(r)
            if rid in old_ids and old_ids[rid] != current[rid]:
                check(False, f"[{name}] id「{rid}」疑似改绑：{old_ids[rid]} → {current[rid]}"
                      f"（错题本锚点！改内容请删行+新行新id，或确认是有意迁移后删除快照重跑）")
        for rid in old_ids:
            if rid not in current:
                removed += 1
    return removed, sum(len(v) for t in old.values() for v in [t])


def save_snapshot(tables):
    snap = {name: {r.get("id", ""): row_fingerprint(r) for _, r in rows}
            for name, rows in tables.items()}
    SNAPSHOT.write_text(json.dumps(snap, ensure_ascii=False, indent=1), encoding="utf-8")


# ---------- 主流程 ----------

def main():
    csvs = sorted(LEXICON.glob("*.csv"))
    if not csvs:
        print("找不到任何 CSV:", LEXICON)
        sys.exit(1)

    tables = {}
    for p in csvs:
        name = p.stem
        if name not in TABLE_RULES:
            errors.append(f"[{name}] 未注册校验规则（TABLE_RULES），引擎拒绝构建未知表")
            continue
        rows = load_table(p)
        if rows is not None:
            TABLE_RULES[name](name, rows)
            tables[name] = rows

    removed, old_total = check_rebind(tables) if not errors else (0, 0)

    if errors:
        print("校验失败，%d 个错误：" % len(errors))
        for e in errors:
            print("  ✗", e)
        sys.exit(1)

    # version：内容 hash（只算数据，注释不参与）
    plain = {name: [r for _, r in rows] for name, rows in tables.items()}
    digest = hashlib.sha1(json.dumps(plain, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    version = f"v-{date.today():%Y%m%d}-{digest[:4]}"

    config = {"version": version, "tables": plain}
    text = json.dumps(config, ensure_ascii=False, indent=2) + "\n"
    # 前端产物必须是 .ts：小程序运行时 require 不支持 *.json（WAService module not defined）
    FRONT_TS.write_text(
        "// config.ts —— 词库配置（本文件由 data/scripts/build-config.py 生成，勿手改）\n"
        "// 数据源：data/csvs/*.csv；云端用同数据的 cloudfunctions/genQuiz/data/config.json\n"
        f"export const CONFIG = {json.dumps(config, ensure_ascii=False)} as const\n"
        f"export const CONFIG_VERSION = '{version}'\n",
        encoding="utf-8")
    CLOUD_JSON.write_text(text, encoding="utf-8")

    save_snapshot(tables)

    print("✓ 构建成功 version=%s" % version)
    for name, rows in tables.items():
        print("  · %s: %d 行" % (name, len(rows)))
    if old_total:
        print("  · 快照对比通过（旧锚点 %d 个，移除 %d 个）" % (old_total, removed))
    print("  → miniprogram/utils/config.ts / cloudfunctions/genQuiz/data/config.json / id-snapshot.json 已同步")


if __name__ == "__main__":
    main()
