/** 三语词典索引：zh-CN 为基础全量词典，zh-TW / en 为覆盖层（缺失时回退 zh-CN）。 */
import { commonZhCN } from "./zh-CN/common"
import { coreZhCN } from "./zh-CN/core"
import { courseZhCN } from "./zh-CN/course"
import { kbZhCN } from "./zh-CN/kb"
import { symlinkZhCN } from "./zh-CN/symlink"
import { sysZhCN } from "./zh-CN/sys"

import { commonZhTW } from "./zh-TW/common"
import { coreZhTW } from "./zh-TW/core"
import { courseZhTW } from "./zh-TW/course"
import { kbZhTW } from "./zh-TW/kb"
import { symlinkZhTW } from "./zh-TW/symlink"
import { sysZhTW } from "./zh-TW/sys"

import { commonEn } from "./en/common"
import { coreEn } from "./en/core"
import { courseEn } from "./en/course"
import { kbEn } from "./en/kb"
import { symlinkEn } from "./en/symlink"
import { sysEn } from "./en/sys"

export const zhCN: Record<string, string> = {
  ...commonZhCN,
  ...coreZhCN,
  ...courseZhCN,
  ...kbZhCN,
  ...symlinkZhCN,
  ...sysZhCN,
}

export const zhTW: Record<string, string> = {
  ...commonZhTW,
  ...coreZhTW,
  ...courseZhTW,
  ...kbZhTW,
  ...symlinkZhTW,
  ...sysZhTW,
}

export const en: Record<string, string> = {
  ...commonEn,
  ...coreEn,
  ...courseEn,
  ...kbEn,
  ...symlinkEn,
  ...sysEn,
}
