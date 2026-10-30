# -*- coding: utf-8 -*-
"""生成「门店任务批量导入」模板（xlsx + csv）。

设计口径（已与需求方对齐）：
  · 一行 = 一个任务，门店列里写多个店名（顿号/逗号/空格分隔），填「全部」= 19 家店
  · 四种任务类型都支持：每日 / 每周 / 每月 / 专项
  · 主表只有表头，不放示例行 —— 因为导入策略是「整批回滚」，
    示例行忘了删会导致整批失败，所以示例单独放一个 sheet

跑法：
  python build_template.py
"""
import csv
import io
import json
import os

from openpyxl import Workbook
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.worksheet.datavalidation import DataValidation

HERE = os.path.dirname(os.path.abspath(__file__))
SEED = os.path.join(HERE, "..", "..", "data", "seed.json")


def load_stores():
    """门店清单直接读系统种子，保证模板里的店名和库里一模一样（不会因为改名而失配）。"""
    with io.open(SEED, encoding="utf-8") as f:
        seed = json.load(f)
    rows = []
    for s in seed.get("STORE_SEED", []):
        if s.get("enabled") is False:
            continue
        rows.append([s.get("name", ""), s.get("brand", ""), s.get("city", "")])
    return rows

# 与 web/css/app.css 保持一致
C_BRAND = "3D57D6"      # --brand-600 必填列表头
C_BRAND2 = "7E93F5"     # 选填列表头（brand 提亮）
C_BRAND_L = "EDF1FE"    # --brand-50
C_LINE = "E3E8F1"       # --line
C_TEXT = "171C28"       # --text
C_TEXT2 = "5A6478"      # --text-2
C_WARN_BG = "FFF4DC"    # --warn-bg
C_WARN_TX = "9A6A00"
F = "微软雅黑"

# name, width, required, 说明, 取值/示例
COLS = [
    ("任务标题*", 28, True, "门店在任务卡片上看到的第一行文字，建议控制在 20 字内",
     "10月会员日活动物料陈列"),
    ("任务说明*", 46, True, "门店要做什么，越具体越好；支持换行",
     "按总部下发图样摆放堆头，收银台立牌 2 个，完成后拍照上传"),
    ("任务类型*", 12, True, "四选一。每日/每周/每月 = 设定一次长期循环；专项 = 只下发一次",
     "每日 / 每周 / 每月 / 专项"),
    ("每周几", 11, False, "只在「任务类型=每周」时填写，其余留空",
     "周一 ~ 周日"),
    ("每月几号", 11, False, "只在「任务类型=每月」时填写，1-31 的整数；填 31 遇到小月自动落到月末",
     "1 ~ 31"),
    ("截止时刻", 11, False, "每日/每周/每月必填，24 小时制。门店超过这个点算逾期",
     "18:00"),
    ("截止时间", 19, False, "只在「任务类型=专项」时填写，精确到分钟",
     "2026-11-05 18:00"),
    ("派发门店*", 36, True, "多个店名用顿号「、」或逗号分隔；填「全部」= 派给所有营业门店",
     "南昌一店、苏州三店、威海店"),
    ("重要程度", 10, False, "1-5 星，留空按 3 星。影响门店端排序与提醒强度", "3"),
    ("到期前提醒（分钟）", 14, False, "未完成时提前多久提醒门店，留空按 120（2 小时）", "120"),
    ("过期继续提醒", 12, False, "是/否，留空按「是」。过期后门店端任务标红并继续提醒", "是"),
    ("开始日期", 12, False, "周期任务从哪天生效，留空 = 导入当天", "2026-11-01"),
    ("停止日期", 12, False, "周期任务到哪天结束，留空 = 长期有效", "2026-11-30"),
    ("相关链接", 30, False, "可选，必须 http/https 开头；多个用空格分隔", "https://example.com/a.pdf"),
]

# 示例（放独立 sheet）
SAMPLES = [
    ["双十一堆头陈列检查", "按图样完成堆头摆放，收银台立牌 2 个，完成后拍照上传", "专项",
     "", "", "", "2026-11-05 18:00", "南昌一店、苏州三店、威海店", "5", "240", "是", "", "", ""],
    ["每日闭店卫生打卡", "闭店前完成机台擦拭、地面清洁、礼品补齐，拍照上传", "每日",
     "", "", "22:30", "", "全部", "4", "120", "是", "2026-11-01", "", ""],
    ["每周会员日物料更新", "每周三前完成会员日海报更换，拍正视图上传", "每周",
     "周三", "", "12:00", "", "南昌一店、南昌二店、浏阳一店", "3", "120", "否", "", "", ""],
]


def head_font(bold=True, color="FFFFFF", size=11):
    return Font(name=F, bold=bold, color=color, size=size)


def build_xlsx(path):
    wb = Workbook()
    ws = wb.active
    ws.title = "任务导入"
    thin = Side(style="thin", color=C_LINE)
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    # ---- 表头 ----
    for i, (name, width, req, _, _) in enumerate(COLS, start=1):
        c = ws.cell(row=1, column=i, value=name)
        c.font = head_font(color="FFFFFF")
        c.fill = PatternFill("solid", fgColor=C_BRAND if req else C_BRAND2)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = border
        ws.column_dimensions[get_column_letter(i)].width = width
    ws.row_dimensions[1].height = 34
    ws.freeze_panes = "A2"

    # ---- 数据区：白底 + 边框 + 对齐，给到 300 行，方便直接往下填 ----
    empty = PatternFill("solid", fgColor="FFFFFF")
    for r in range(2, 302):
        for i, (name, _w, _req, _d, _s) in enumerate(COLS, start=1):
            c = ws.cell(row=r, column=i)
            c.fill = empty
            c.border = border
            c.font = Font(name=F, size=10, color=C_TEXT)
            if name in ("任务说明*", "派发门店*", "相关链接"):
                c.alignment = Alignment(vertical="center", wrap_text=True)
            else:
                c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=False)
        ws.row_dimensions[r].height = 22

    # ---- 下拉验证 ----
    stores = load_stores()
    store_ref = "'门店清单'!$A$2:$A$%d" % (len(stores) + 1)
    dvs = [
        (DataValidation(type="list", formula1='"每日,每周,每月,专项"', allow_blank=True,
                        showErrorMessage=True, errorTitle="任务类型只能是四种之一",
                        error="请从下拉里选：每日 / 每周 / 每月 / 专项"), "C2:C301"),
        (DataValidation(type="list", formula1='"周一,周二,周三,周四,周五,周六,周日"', allow_blank=True), "D2:D301"),
        (DataValidation(type="list", formula1='"1,2,3,4,5"', allow_blank=True), "I2:I301"),
        (DataValidation(type="list", formula1='"是,否"', allow_blank=True), "K2:K301"),
    ]
    for dv, rng in dvs:
        ws.add_data_validation(dv)
        dv.add(rng)

    # 门店列：下拉给出 19 家店名，但**不拦手打**（showErrorMessage=False）——
    # 因为一行要写多个门店，Excel 原生下拉不支持多选，只能「先选一个再手敲顿号+第二个」
    dv_store = DataValidation(type="list", formula1=store_ref, allow_blank=True,
                              showErrorMessage=False, showDropDown=False)
    ws.add_data_validation(dv_store)
    dv_store.add("H2:H301")

    # ---- 填写说明 ----
    ws2 = wb.create_sheet("填写说明")
    ws2.column_dimensions["A"].width = 22
    ws2.column_dimensions["B"].width = 10
    ws2.column_dimensions["C"].width = 62
    ws2.column_dimensions["D"].width = 30
    heads = ["列名", "是否必填", "怎么填", "取值 / 示例"]
    for i, t in enumerate(heads, start=1):
        c = ws2.cell(row=1, column=i, value=t)
        c.font = head_font()
        c.fill = PatternFill("solid", fgColor=C_BRAND)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = border
    ws2.row_dimensions[1].height = 30
    for r, (name, _w, req, desc, sample) in enumerate(COLS, start=2):
        vals = [name.replace("*", ""), "必填" if req else "选填", desc, sample]
        for i, v in enumerate(vals, start=1):
            c = ws2.cell(row=r, column=i, value=v)
            c.font = Font(name=F, size=10, color=C_TEXT, bold=(i == 1))
            c.alignment = Alignment(vertical="center", wrap_text=True,
                                    horizontal="center" if i == 2 else "left")
            c.border = border
            if req and i == 2:
                c.font = Font(name=F, size=10, color="C00000", bold=True)
        ws2.row_dimensions[r].height = 30

    # 顶部三行通用规则
    rules = [
        "通用规则",
        "① 一行 = 一个任务。多个门店写在同一行的「派发门店」列里，用顿号或逗号分隔。",
        "② 整批校验：只要有一行不合格，本次导入全部不生效（不会出现导一半的情况），失败原因会逐行列出。",
        "③ 与系统中已存在的任务「标题 + 门店 + 截止时间」完全一致时，按重复任务拦截，同样会导致整批失败。",
        "④ 不要改表头文字、不要加合并单元格、不要删列；数据从第 2 行开始填，可以留空行。",
        "⑤ 任务类型=每周 必须填「每周几」；=每月 必须填「每月几号」；=专项 必须填「截止时间」；周期任务必须填「截止时刻」。",
        "⑥ 「派发门店」列点单元格右侧箭头可从「门店清单」里选店名；一行要发多家店时，选完第一家后再敲「、」继续写第二家。",
    ]
    ws2.insert_rows(1, amount=len(rules) + 1)
    for i, t in enumerate(rules, start=1):
        c = ws2.cell(row=i, column=1, value=t)
        if i == 1:
            c.font = Font(name=F, size=12, bold=True, color=C_BRAND)
        else:
            c.font = Font(name=F, size=10, color=C_TEXT2)
            c.alignment = Alignment(vertical="center")

    # ---- 示例 sheet ----
    ws3 = wb.create_sheet("示例")
    for i, (name, width, req, _, _) in enumerate(COLS, start=1):
        c = ws3.cell(row=1, column=i, value=name)
        c.font = head_font()
        c.fill = PatternFill("solid", fgColor=C_BRAND if req else C_BRAND2)
        c.alignment = Alignment(horizontal="center", vertical="center", wrap_text=True)
        c.border = border
        ws3.column_dimensions[get_column_letter(i)].width = width
    ws3.row_dimensions[1].height = 34
    for r, row in enumerate(SAMPLES, start=2):
        for i, v in enumerate(row, start=1):
            c = ws3.cell(row=r, column=i, value=v)
            c.font = Font(name=F, size=10, color=C_TEXT)
            c.fill = PatternFill("solid", fgColor=C_WARN_BG)
            c.alignment = Alignment(vertical="center", wrap_text=bool(i in (2, 8)),
                                    horizontal="left" if i in (2, 8, 14) else "center")
            c.border = border
        ws3.row_dimensions[r].height = 30
    note = ws3.cell(row=len(SAMPLES) + 3, column=1,
                    value="↑ 上面 3 行只是范例，复制内容到「任务导入」sheet 时请自行修改；本 sheet 不会参与导入。")
    note.font = Font(name=F, size=10, italic=True, color=C_WARN_TX)

    # ---- 门店清单（供「派发门店」列下拉引用）----
    ws4 = wb.create_sheet("门店清单")
    for i, (t, w) in enumerate([("门店名称", 22), ("品牌全称", 34), ("城市", 12)], start=1):
        c = ws4.cell(row=1, column=i, value=t)
        c.font = head_font()
        c.fill = PatternFill("solid", fgColor=C_BRAND)
        c.alignment = Alignment(horizontal="center", vertical="center")
        c.border = border
        ws4.column_dimensions[get_column_letter(i)].width = w
    for r, row in enumerate(stores, start=2):
        for i, v in enumerate(row, start=1):
            c = ws4.cell(row=r, column=i, value=v)
            c.font = Font(name=F, size=10, color=C_TEXT)
            c.alignment = Alignment(horizontal="left" if i < 3 else "center", vertical="center")
            c.border = border
    tip = ws4.cell(row=len(stores) + 3, column=1,
                   value="「派发门店」列的下拉选项来自这张表；门店改名后请同步更新，或直接在系统里重新下载模板。")
    tip.font = Font(name=F, size=10, italic=True, color=C_TEXT2)
    ws4.freeze_panes = "A2"

    wb.save(path)
    return path


def build_csv(path):
    """UTF-8 BOM，Excel 双击打开不乱码；表头与 xlsx 完全一致。"""
    with io.open(path, "w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow([c[0] for c in COLS])
        for row in SAMPLES[:1]:
            w.writerow(row)
    return path


if __name__ == "__main__":
    p1 = build_xlsx(os.path.join(HERE, "任务批量导入模板.xlsx"))
    p2 = build_csv(os.path.join(HERE, "任务批量导入模板.csv"))
    for p in (p1, p2):
        print("%s  %d bytes" % (p, os.path.getsize(p)))
