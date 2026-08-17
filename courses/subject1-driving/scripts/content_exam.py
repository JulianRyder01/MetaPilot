# -*- coding: utf-8 -*-
"""科目一驾考宝典 · 第13章 考前冲刺 + 第14章 全真模拟考试（100 题）。

模拟卷口径：40 道判断题 + 60 道单选题，每题限定时间（判断 22s / 单选 30s，
超时自动提交），总时长约 45 分钟，90 分合格——与真实科目一机考一致。
"""
from __future__ import annotations
from build import md, judge, q, iv, section, study, quiz

def chapters() -> list:
    return [
        # ============ 第13章 考前冲刺速记 ============
        study(
            "第13章 考前冲刺速记",
            section(
                "13.1 口诀总表",
                md("""## 考前 1 小时必背口诀（本课程精华浓缩）

**记分五档**（2022 新规）：12 / 9 / 6 / 3 / 1
- 12 分：假牌酒驾轻伤逃，高速倒逆重车超，客运超员二成记，代分牟利跑不掉
- 9 分：准驾不符无牌污，校车无证高速停，重车普路超半百，七座超员五至百
- 6 分：闯灯占道扣证开，轻微伤逃普超半，重车普路二五档，高速超速未足二
- 3 分：打电话不礼让，不避校车加塞忙，高速低限车道乱，普路超速二五档
- 1 分：禁令标线会车灯，超宽超长兼超重，系好安全带，重点普路超一成

**限速**：城 3 公 4 无中心；城 5 公 7 有中心；急窄掉弯陡、冰雪进出非机道=30

**高速**：最高 120 最低 60；入高速门槛 70；双道左百右六；三道一一九六；四道一一九九六

**能见度**：261（<200→60→100）、145（<100→40→50）、520（<50→20→驶离）

**车距**：>100 时速保持 100 米，≤100 时速保持 50 米

**让行**：让右 → 转弯让直行 → 右转让左转；进环岛让岛内先行

**禁超区域**：铁交窄弯陡隧人（铁路道口、交叉路口、窄桥、弯道、陡坡、隧道、人行横道）

**标志颜色**：红禁黄警蓝指绿指路、棕旅游橙施工；黄实线禁停、黄虚线禁长停；白字最低速、黄字最高速

**事故**：车靠边、人撤离、即报警；普通道路警告标志 50-100 米、高速 150 米外

**灯光**：夜间会车 150 米切近光；雾天雾灯+近光禁远光；夜间超车交替远近光"""),
                iv("interactives/mnemonic_cards.html", "📇 口诀记忆卡：4 组卡片翻转背诵 + 测验", 600),
                judge("高速公路能见度口诀 261 表示：能见度小于 200 米，时速 60，车距 100 米。", True, "261：<200m→60km/h→100m，背熟即可得分。"),
            ),
            section(
                "13.2 高频易错对比速查",
                md("""## 7 组最容易做错的对比

| # | 易混项 | 正确区分 |
|---|---|---|
| 1 | 未悬挂/遮挡污损号牌 **9 分** vs 不按规定安装号牌 **3 分** | 遮挡污损重、安装小事轻 |
| 2 | 高速违法停车 **9 分** vs 占用应急车道 **6 分** | 停车更危险 |
| 3 | 高速倒车/逆行/中央带掉头 **12 分** vs 普通道路逆行 **3 分** | 高速=12 分顶格 |
| 4 | 重点车普通道路超速 50% 以上 **9 分** vs 普通车 **6 分** | 先看车型 |
| 5 | 普通车高速超速 50% 以上 **12 分** vs 普路超 50% **6 分** | 先看道路 |
| 6 | 违反禁令标志/标线 **1 分**（新规） vs 旧规则 **3 分** | 2022 后已降档 |
| 7 | 伪造变造牌证：拘留+2000-5000（记 12 分） vs 无证驾驶：200-2000 可拘留（不记分） | 性质不同 |

**易错数字再强化**：

- 醉驾吊销：普通车 5 年不得重考；营运车 10 年并终身禁驾营运车；酒驾致重大事故犯罪=终生禁驾
- 满分学习：7 日（现场≥2 日）+ 考科目一；两次满 12 分/累计 24 分以上加考科目三
- 学法减分：网上 30 分钟考试合格 1 分 / 现场 1 小时 2 分 / 公益 1 小时 1 分，上限 6 分/周期
- 换证：期满前 90 日；信息变更 30 日；70 岁以上每年体检
- 实习期：12 个月；高速需 3 年以上驾龄陪同；实习期记分不可学法减分抵消"""),
                q("下列关于记分的说法，正确的是？", ["未悬挂号牌与不按规定安装号牌都记 9 分", "高速违法停车记 6 分", "校车普通道路超速 50% 以上记 9 分", "普通车普通道路超速 50% 以上记 12 分"], 2, "校车等重点车辆在普通道路超速 50% 以上记 9 分；未悬挂号牌 9 分但安装不当仅 3 分；高速违法停车 9 分；普通车普路超 50% 记 6 分。"),
                judge("2022 年新规后，违反禁令标志、禁止标线指示一次记 1 分。", True, "从 3 分降为 1 分，注意老题库答案勿用。"),
            ),
            section(
                "13.3 考场策略",
                md("""## 上考场前再叮嘱

1. **时间分配**：45 分钟 100 题，平均每题不到 30 秒。先做有把握的，难题标记后跳过，最后回头补；
2. **判断题定式**：题干出现"可以随意、无需任何、全部、一律（绝对化）"多选**错误**；出现"减速、观察、让行、注意安全"多选**正确**；
3. **数字题三看**：看车型（重点车辆？）、看道路（高速/快速路 or 普通路）、看比例（超速百分之几）——三看完毕再对档位；
4. **图题**：先辨颜色（红黄蓝绿）再辨形状（三角/圆形/矩形），答案呼之欲出；
5. 交卷前检查：90 分合格，拿不准的题按第一直觉，**不要轻易改动**（改错概率大于改对）。"""),
                md("""## 学完 13 章，接受终极检验

进入**第14章 全真模拟考试**：100 题、45 分钟、90 分合格，与真实机考同规格。

**考试纪律（自我要求）**：开卷可查笔记，但请按模拟计时作答；错题回看解析并回到对应章节强化。连续两套模拟 95+ 后，你就可以自信去考场了。祝 100 分收官！"""),
            ),
        ),
        # ============ 第14章 全真模拟考试 ============
        quiz(
            "第14章 全真模拟考试（100题 · 45分钟）",
            section(
                "考试说明（务必先读）",
                md("""## 📋 全真模拟考试说明

- **题量与分值**：100 题 × 1 分 = 100 分，**90 分合格**；
- **题型**：判断题 40 道 + 单选题 60 道（真实机考规格，无多选题）；
- **计时**：判断题每题 **22 秒**、单选题每题 **30 秒**，超时自动按已填内容提交（合计约 45 分钟）；
- **建议**：关闭干扰、连续作答；全部完成后统计得分，错题回看解析并回炉对应章节；
- 本卷含高频考点 + 易错陷阱题，覆盖 2022 新规口径。"""),
            ),
            section("模拟考试 · 判断题（40 道）",
                *[
                    judge("饮酒后驾驶机动车，一次记 12 分。", True, "饮酒驾驶（含醉驾）一次记 12 分。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶与准驾车型不符的机动车，一次记 12 分。", False, "新规为 9 分（老规定 12 分已降档）。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("故意遮挡机动车号牌上路行驶，一次记 9 分。", True, "未悬挂/故意遮挡污损号牌记 9 分；不按规定安装号牌才记 3 分。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶机动车在高速公路上倒车、逆行、穿越中央分隔带掉头，一次记 12 分。", True, "高速倒车/逆行/中央带掉头记满 12 分。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶机动车不按交通信号灯指示通行（闯红灯），一次记 6 分。", True, "闯红灯记 6 分。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶机动车在高速公路上违法占用应急车道行驶，一次记 3 分。", False, "占用应急车道记 6 分；高速违法停车才是 9 分。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶机动车在高速公路上低于规定最低时速行驶，一次记 3 分。", True, "高速龟速低于最低限速记 3 分。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶机动车违反禁令标志、禁止标线指示，一次记 1 分。", True, "2022 新规降为 1 分。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶机动车不按规定使用灯光，一次记 1 分。", True, "不按规定使用灯光记 1 分。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶机动车行经人行横道不按规定减速、停车、避让行人的，一次记 3 分。", True, "不礼让斑马线记 3 分。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶机动车未按规定系安全带的，一次记 3 分。", False, "驾驶人不系安全带记 1 分（新规 2 分降为 1 分）。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶校车在普通道路上超速 50% 以上，一次记 9 分。", True, "重点车辆普通道路超速 50% 以上记 9 分。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶普通机动车在普通道路上超速 50% 以上，一次记 9 分。", False, "普通车普通道路超速 50% 以上记 6 分；重点车辆才记 9 分。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("代替他人记分并牟取经济利益的，一次记 12 分。", True, "买卖分代扣牟利记 12 分并处罚款。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("货车超载超过最大允许总质量 50% 以上的，一次记 6 分。", True, "超载 50% 以上记 6 分；30%-50% 记 3 分；<30% 记 1 分。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("无证驾驶机动车的行为会记 12 分。", False, "无证驾驶不记分，只罚款 200-2000 元并可并处拘留。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("造成致人轻伤以上的交通事故后逃逸，尚不构成犯罪的，一次记 12 分。", True, "轻伤以上逃逸记 12 分；轻微伤/财产损失逃逸记 6 分。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("一个记分周期内累积记分达到 12 分的，驾驶证会被扣留并需参加满分学习。", True, "记满 12 分扣留驾驶证，15 日内参加 7 日满分学习并考科目一。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶证实习期为 6 个月。", False, "实习期统一 12 个月。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("实习期驾驶人在高速公路上驾驶机动车，需由持相应或更高准驾车型驾驶证 3 年以上的驾驶人陪同。", True, "实习期上高速的陪同要求是高频考点。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("醉酒驾驶机动车被吊销驾驶证的，5 年内不得重新取得。", True, "普通车醉驾吊销 5 年；营运车 10 年禁驾营运。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("机动车驾驶证有效期满前 90 日内，可以申请换证。", True, "期满前 90 日换证；信息变更 30 日。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("70 周岁以上的驾驶人，需每年提交一次身体条件证明。", True, "70 岁以上每年体检；记分周期结束后 30 日内提交。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾考理论学习中，网上学习累计满 30 分钟并考试合格，可以减免记分 1 分。", True, "学法减分：网上 3 日累计 30 分钟+考试合格减 1 分，周期上限 6 分。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶机动车在城市道路没有中心线时，最高时速不得超过 40km/h。", False, "城市无中心线 30km/h；公路无中心线才 40km/h。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶机动车在冰雪、泥泞道路上行驶，最高时速不得超过 30km/h。", True, "冰雪泥泞一律 30km/h。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("高速公路同方向 3 条车道，最左侧车道的最低车速为 110km/h。", True, "三道：110/90/60。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("高速公路最高车速不得超过 120km/h，最低不得低于 60km/h。", True, "高速总规则：120 上限、60 底线。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("高速公路上能见度小于 100 米时，车速不得超过 40km/h，与前车保持 50 米以上距离。", True, "口诀 145。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("高速公路上能见度小于 50 米时，应以不超过 30km/h 的速度行驶。", False, "第三档是 20km/h 并从最近出口驶离，不是 30。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("驾驶机动车通过铁路道口时，最高时速不得超过 30km/h，并应一停二看三通过。", True, "铁路道口限 30 并停车瞭望。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("转弯的机动车应让直行的车辆先行。", True, "转弯让直行是铁律。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("在没有信号灯的交叉路口，应让左方道路的来车先行。", False, "让右原则——让右方道路来车先行。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("夜间会车时，应在距对方来车 150 米以外改用近光灯。", True, "150 米外切近光，防止晃眼。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("雾天行车开启远光灯可以增加可见距离。", False, "雾天禁开远光，应开雾灯+近光。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("黄色三角形、黑边黑图案的标志为警告标志。", True, "黄三角=警告。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("路缘石上的黄色虚线表示禁止停车。", False, "黄虚线=禁止长时间停车（可临时停靠）；黄实线才禁止停车。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("交警手势与交通信号灯不一致时，应服从交警指挥。", True, "优先级：交警指挥>信号灯>标志标线。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("在高速公路上车辆发生故障，警告标志应设置在来车方向 100 米以外。", False, "高速故障警告标志 150 米外；普通道路 50-100 米。", timeLimitSec=22, autoSubmitOnTimeout=True),
                    judge("ABS 防抱死制动系统可以显著缩短制动距离。", False, "ABS 保转向、防抱死，不缩短制动距离。", timeLimitSec=22, autoSubmitOnTimeout=True),
                ]),
            section("模拟考试 · 单选题（60 道）",
                *[
                    q("驾驶机动车不按规定避让校车的，一次记多少分？", ["1 分", "3 分", "6 分", "9 分"], 1, "不避让校车记 3 分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("驾驶机动车在普通道路上超速 20% 以上未达 50%，一次记多少分？", ["1 分", "3 分", "6 分", "9 分"], 1, "普通车普路超速 20%-50% 记 3 分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("驾驶机动车接打手持电话，一次记多少分？", ["1 分", "3 分", "6 分", "9 分"], 1, "接打手持电话记 3 分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("驾驶机动车遇前方排队时借道超车、穿插等候车辆的，一次记多少分？", ["1 分", "3 分", "6 分", "9 分"], 1, "\"加塞\"记 3 分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("驾驶机动车在高速公路/城市快速路上不按规定车道行驶，一次记多少分？", ["1 分", "3 分", "6 分", "9 分"], 1, "高速不按规定车道行驶记 3 分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("7 座以上载客汽车超员 50% 以上未达 100%，一次记多少分？", ["6 分", "9 分", "12 分", "3 分"], 1, "7 座以上超员 50%-100% 记 9 分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("驾驶证被暂扣或扣留期间驾驶机动车，一次记多少分？", ["3 分", "6 分", "9 分", "12 分"], 1, "扣证期间驾驶记 6 分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("造成致人轻微伤或者财产损失的交通事故后逃逸，尚不构成犯罪的，一次记多少分？", ["3 分", "6 分", "12 分", "9 分"], 1, "轻微伤/财损逃逸记 6 分；轻伤以上逃逸才记 12 分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("未取得机动车驾驶证驾驶机动车的，处？", ["20-200 元罚款", "200-2000 元罚款，可并处 15 日以下拘留", "记 12 分", "吊销驾驶证"], 1, "无证驾驶：罚款 200-2000 元+可拘留，不记分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("饮酒后驾驶机动车未构成醉酒的，依法？", ["暂扣驾驶证 6 个月并处 1000-2000 元罚款", "吊销驾驶证 5 年", "处拘役并处罚金", "以危险驾驶罪追究刑事责任"], 0, "酒驾（非醉）暂扣 6 个月+罚款；醉驾才涉刑。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("驾驶机动车超过规定时速 50% 以上的，可并处？", ["暂扣驾驶证", "吊销驾驶证", "终身禁驾", "没收车辆"], 1, "超速 50% 以上可并处吊销驾驶证。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("组织他人买卖机动车驾驶证分值牟利的，处？", ["违法所得 3 倍以下罚款，最高 5 万元", "违法所得 5 倍以下罚款，最高 10 万元", "只记分不罚款", "终身禁驾"], 1, "组织卖分：5 倍/10 万；自己代扣分牟利：3 倍/5 万+记 12 分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("交通肇事后逃逸致人死亡的，处？", ["3 年以下有期徒刑或拘役", "3 年以上 7 年以下有期徒刑", "7 年以上有期徒刑", "终身监禁"], 2, "逃逸致人死亡为最高档：7 年以上。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("申请小型汽车驾驶证，最低年龄为？", ["16 周岁", "18 周岁", "20 周岁", "21 周岁"], 1, "C1/C2 申领年龄 18 周岁以上。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("以欺骗、贿赂等不正当手段取得驾驶证的，几年内不得申请？", ["1 年", "2 年", "3 年", "5 年"], 2, "欺骗贿赂取得：3 年内不得申请；虚假材料申领才是 1 年。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("一个记分周期内记满 12 分，应当参加多少日满分学习？", ["3 日", "5 日", "7 日", "10 日"], 2, "满分学习 7 日（现场教育不少于 2 日），期满考科目一。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("参加交通安全公益活动满 1 小时，可以减免记分？", ["1 分", "2 分", "3 分", "6 分"], 0, "公益 1 小时减 1 分；现场学习 1 小时减 2 分；网上 30 分钟考试合格减 1 分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("一个记分周期内，学法减分最高可累计减免？", ["3 分", "4 分", "5 分", "6 分"], 3, "学法减分每周期上限 6 分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("驾驶证信息变更（如住址变化），应在多少日内到车管所换证？", ["15 日", "30 日", "60 日", "90 日"], 1, "信息变更 30 日内办理换证；期满换证为前 90 日。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("驾驶机动车在没有道路中心线的城市道路上，最高时速不得超过？", ["30km/h", "40km/h", "50km/h", "70km/h"], 0, "城3公4：城市无中心线 30，公路无中心线 40。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("驾驶机动车在有中心线（同向一车道）的公路上，最高时速不得超过？", ["40km/h", "50km/h", "60km/h", "70km/h"], 3, "公路有中心线 70；城市有中心线 50。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("驾驶机动车通过急弯路、窄路、窄桥时，最高时速不得超过？", ["20km/h", "30km/h", "40km/h", "50km/h"], 1, "特殊场景一律 30km/h。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("设计最高时速低于多少的机动车不得进入高速公路？", ["60km/h", "70km/h", "80km/h", "90km/h"], 1, "低于 70km/h 不得上高速。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("同方向 2 条车道的高速公路，最左侧车道的最低车速为？", ["90km/h", "100km/h", "110km/h", "120km/h"], 1, "双道：左百右六。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("同方向 4 条车道的高速公路，最左侧车道的最低车速为？", ["90km/h", "100km/h", "110km/h", "120km/h"], 2, "四道：110/90/90/60。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("驾驶机动车在高速公路上时速超过 100km/h，与前车应保持的最小距离为？", ["50 米", "80 米", "100 米", "120 米"], 2, ">100km/h→100 米；≤100km/h→50 米。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("高速公路上能见度小于 200 米时，车速不得超过？", ["20km/h", "40km/h", "60km/h", "80km/h"], 2, "261：<200→60→100。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("高速公路上能见度小于 50 米时，正确的做法是？", ["以不超过 20km/h 的速度行驶并从最近出口驶离", "以不超过 40km/h 的速度继续行驶", "靠边停车等待", "开启远光灯加速行驶"], 0, "520：<50→20→驶离。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("在没有交通信号灯控制的路口，转弯的机动车与直行的机动车相遇，谁先行？", ["转弯车", "直行车", "先到者", "大车"], 1, "转弯让直行。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("在没有信号灯的路口，直行车辆遇到右方道路来车（均直行），应？", ["我方先行", "让右方来车先行", "鸣喇叭示意", "贴左通过"], 1, "让右原则。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("相对方向行驶的右转弯机动车与左转弯机动车相遇，谁先行？", ["右转弯车", "左转弯车", "同时通过", "公交车优先"], 1, "右转让左转。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("超车时应当从被超车辆的哪一侧超越？", ["右侧", "左侧", "后侧", "哪空走哪"], 1, "必须左侧超车。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("驾驶机动车通过隧道时，应当？", ["开启远光灯提高视线", "降低车速并开启近光灯", "加速通过", "鸣喇叭提醒"], 1, "隧道内减速开近光，禁止变道超车。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("夜间超车时，除了开启左转向灯，还应？", ["鸣喇叭或交替变换远近光灯提示前车", "持续开远光灯", "开启危险报警闪光灯", "无需提示"], 0, "夜间超车：左转向灯+交替远近光提示。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("黄色底、黑色边、三角形的交通标志属于？", ["禁令标志", "警告标志", "指示标志", "指路标志"], 1, "黄三角=警告。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("红色圆形边框的交通标志一般表示？", ["警告", "禁止/限制", "指示", "指路"], 1, "红色=禁令。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("白色圆形、蓝底的标志（内有数字）表示？", ["最高限速", "最低限速", "建议车速", "解除限速"], 1, "蓝底白字圆形=最低限速；红圈白底数字=最高限速。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("路缘石上的黄色实线表示？", ["禁止停车", "禁止长时间停车", "可以临时停车", "专用停车位"], 0, "黄实线禁停；黄虚线禁长停。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("路缘石上的黄色虚线表示？", ["禁止停车", "禁止长时间停车", "禁止掉头", "禁止超车"], 1, "黄虚线可临时停靠，禁长时停放。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("地面白色数字表示？", ["最高限速", "最低限速", "车速建议", "车道编号"], 1, "白字=最低限速；黄字=最高限速。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("道路中心黄色虚线的作用是？", ["分隔对向车流，可确保安全时越线超车", "分隔同向车道", "禁止跨压", "表示停车位"], 0, "黄虚线：对向分隔，可安全越线；黄双实线禁止跨越。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("停车让行线（双白实线）表示？", ["减速让行", "停车让行", "禁止变道", "禁止掉头"], 1, "双白实线=停车让行；双白虚线=减速让行。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("交警指挥、信号灯、标志标线同时出现且不一致时，应优先服从？", ["信号灯", "交警指挥", "标志标线", "导航提示"], 1, "交警指挥优先。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("交警一臂上举、掌心向前，表示？", ["直行", "停止", "左转弯", "减速慢行"], 1, "上举掌心向前=停止信号。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("在普通道路上发生故障停车，警告标志应设在来车方向多远？", ["30-50 米", "50-100 米", "100-150 米", "150 米以上"], 1, "普通道路 50-100 米；高速 150 米外。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("机动车在高速公路上发生故障，人员应转移到？", ["原地等待", "右侧路肩或护栏外", "车内锁好车门", "对向车道"], 1, "车靠边、人撤离、即报警。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("事故后因处置不当造成拥堵或二次事故的，记多少分？", ["1 分", "3 分", "6 分", "9 分"], 2, "未设警告标志记 3 分；造成拥堵/二次事故记 6 分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("机动车与行人发生事故，机动车无过错，应承担不超过多少的赔偿责任？", ["0%", "10%", "50%", "100%"], 1, "无过错责任原则：不超过 10%。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("发现伤员心跳骤停，现场应首先？", ["立即进行心肺复苏并呼叫 120", "等待救护车", "喂水", "抬离现场"], 0, "黄金 4 分钟心肺复苏。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("搬运骨折伤员前，应先？", ["固定骨折部位", "喂止痛药", "让伤员站立", "直接背起"], 0, "先固定再搬运，防二次损伤。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("小面积烧伤烫伤第一时间应？", ["涂抹牙膏", "流动冷水冲洗降温", "涂抹酱油", "挑破水泡"], 1, "冷水冲洗降温，禁涂牙膏酱油。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("高速行驶中突然爆胎，正确处置是？", ["急踩刹车立即停车", "握稳方向盘、轻点制动缓慢减速后靠边", "猛打方向修正", "立即熄火"], 1, "爆胎：握稳方向+缓制动，忌急刹急转。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("仪表盘上红色机油压力报警灯亮起，应？", ["继续行驶", "立即停车熄火检查", "加速到维修店", "开窗散热"], 1, "红色报警灯立即停车处理。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("ABS 指示灯亮起表示？", ["制动系统正常", "防抱死制动系统故障", "车辆超速", "胎压正常"], 1, "ABS 黄灯=防抱死系统故障，谨慎驾驶并检修。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("紧急制动时 ABS 正确操作是？", ["轻点刹车", "用力持续踩住制动踏板", "反复快速点刹", "拉手刹"], 1, "ABS 需用力踩住，保持转向能力。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("自适应巡航控制系统的英文简称是？", ["ABS", "ACC", "LDW", "ESP"], 1, "ACC=Adaptive Cruise Control；LDW=车道偏离预警。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("驶离高速公路时，应开启？", ["左转向灯", "右转向灯", "双闪", "雾灯"], 1, "驶离高速开右转灯；汇入主路开左转灯。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("连续驾驶普通载货汽车超过 4 小时未停车休息或休息不足 20 分钟的，记多少分？", ["1 分", "3 分", "6 分", "9 分"], 1, "普通货车疲劳驾驶记 3 分；重点车辆记 9 分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("机动车驾驶证被扣押期间，驾驶人？（单选）", ["可以向车管所申请补发", "不得申请补发", "可以申请换新证", "可以申请增驾"], 1, "扣押/扣留/暂扣期间不得申请补发。", timeLimitSec=30, autoSubmitOnTimeout=True),
                    q("下列哪种行为会被一次记满 12 分？", ["开车接打电话", "未系安全带", "饮酒后驾驶机动车", "违反禁止标线"], 2, "酒驾记 12 分；其余分别是 3/1/1 分。", timeLimitSec=30, autoSubmitOnTimeout=True),
                ]),
        ),
    ]