# data/csvs —— 配表编辑规范（数据单一真源）

## 目录职责

```
data/
  csvs/      ← 数据源 CSV（常改、最重要）Excel 编辑
  scripts/   ← 构建引擎 build-config.py + id-snapshot.json
```

构建产物：前端 `miniprogram/utils/config.ts`、云函数 `cloudfunctions/genQuiz/data/config.json`，不在此目录。
（云数据库导入文件 db_hanzi.json 已废弃——genQuiz 直读内置 config.json；切云库时再恢复）

## 文件结构（四段式）

```
行1  列名    id,unit,source,hanzi,pinyin,words
行2  类型    string,number,string,string,string,array(string)
行3  注释    行唯一id（永不改绑不复用）,单元号1-8,...
行4+ 数据    zh-3-上-u1-晨,1,lesson,晨,chén,早晨|晨读
```

- 类型 DSL：`string` / `number` / `array(string|number)` / `array(array(string|number))`
- 一维数组按 `|` 分隔；二维外层 `|` 内层 `,`（内层逗号 Excel 会自动加引号，正常）
- 注释行**禁用逗号**（改用 、 或空格），脚本会拦截
- 空单元格 = 该字段缺省；id 列不允许空

## id 纪律（错题本安全线）

- id 语义化：`zh-3-上-u1-晨`（学科-年级-册-单元-字）/ `zw-3-上-u1-早晨`（词语）/ `en-3-上-u1-name`（英语单词）
- **表内唯一，永不改绑、永不复用**：错题本 itemRef 用 id 锚定
- 改错字 = 删旧行 + 加新行（新 id）；插行 = 换新 id，别动已有 id
- 脚本维护 `data/scripts/id-snapshot.json` 快照，改绑会被构建拦截
  （若确认有意迁移 id，删除快照文件重跑一次即可重建）

## 构建流程

```
Excel 编辑 CSV → python3 data/scripts/build-config.py → 同步重新部署云函数 genQuiz
```

产物（同一份数据的两种包装，均由构建脚本同时生成）：
- `miniprogram/utils/config.ts`（前端；小程序运行时 require 不支持 *.json，产物必须为 js/ts）
- `cloudfunctions/genQuiz/data/config.json`（云函数 require，Node 支持 JSON）
version 由内容 hash 自动生成，改数据不用手动记版本号。

## 新表接入（将来数学/英语）

1. 新建 `data/csvs/<表名>.csv`（四段式，表名即 JSON key，如 `math-3a-add`）
2. 在 `data/scripts/build-config.py` 的 `TABLE_RULES` 注册该表的校验函数
3. 业务规则（unit 范围、枚举值等）写在各自校验函数里，引擎不含业务
4. 未注册的表会被构建拒绝（防止无名表混入）

当前表清单：`hanzi-3a`（282 字）、`word-zh`（37 词）、`word-en`（人教 PEP 三年级上 123 词）
