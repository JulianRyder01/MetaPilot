/** 三语词典索引：zh-CN 为基础全量词典，zh-TW / en 为覆盖层（缺失时回退 zh-CN）。 */
import { commonZhCN } from "./zh-CN/common"
import { coreZhCN } from "./zh-CN/core"
import { courseZhCN } from "./zh-CN/course"
import { insightZhCN } from "./zh-CN/insight"
import { symlinkZhCN } from "./zh-CN/symlink"
import { sysZhCN } from "./zh-CN/sys"
import { tutorialZhCN } from "./zh-CN/tutorial"

import { commonZhTW } from "./zh-TW/common"
import { coreZhTW } from "./zh-TW/core"
import { courseZhTW } from "./zh-TW/course"
import { insightZhTW } from "./zh-TW/insight"
import { symlinkZhTW } from "./zh-TW/symlink"
import { sysZhTW } from "./zh-TW/sys"
import { tutorialZhTW } from "./zh-TW/tutorial"

import { commonEn } from "./en/common"
import { coreEn } from "./en/core"
import { courseEn } from "./en/course"
import { insightEn } from "./en/insight"
import { symlinkEn } from "./en/symlink"
import { sysEn } from "./en/sys"
import { tutorialEn } from "./en/tutorial"

export const zhCN: Record<string, string> = {
  ...commonZhCN,
  ...coreZhCN,
  ...courseZhCN,
  ...insightZhCN,
  ...symlinkZhCN,
  ...sysZhCN,
  ...tutorialZhCN,
}

export const zhTW: Record<string, string> = {
  ...commonZhTW,
  ...coreZhTW,
  ...courseZhTW,
  ...insightZhTW,
  ...symlinkZhTW,
  ...sysZhTW,
  ...tutorialZhTW,
}

export const en: Record<string, string> = {
  ...commonEn,
  ...coreEn,
  ...courseEn,
  ...insightEn,
  ...symlinkEn,
  ...sysEn,
  ...tutorialEn,
}
