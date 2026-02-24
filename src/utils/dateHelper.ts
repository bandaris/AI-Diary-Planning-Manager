// src/utils/dateHelper.ts

// 把 "2026年1月29日.html" 转换成 "2026-01-29"
export const filenameToDate = (filename: string): string | null => {
  // 正则匹配：提取年、月、日
  const match = filename.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (match) {
    const year = match[1];
    const month = match[2].padStart(2, '0'); // 补齐0，变成 01
    const day = match[3].padStart(2, '0');   // 补齐0
    return `${year}-${month}-${day}`;
  }
  return null;
};

// 把 Date 对象转成 "2026年1月29日" (用于后续新建日记)
export const dateToChineseString = (date: Date): string => {
  const y = date.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  return `${y}年${m}月${d}日`;
}