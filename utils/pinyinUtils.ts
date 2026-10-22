/**
 * Tiện ích chuẩn hóa và so khớp Pinyin trên server
 */

export const PINYIN_TONE_MAP: Record<string, string> = {
  ā: "a", á: "a", ǎ: "a", à: "a",
  ē: "e", é: "e", ě: "e", è: "e",
  ī: "i", í: "i", ǐ: "i", ì: "i",
  ō: "o", ó: "o", ǒ: "o", ò: "o",
  ū: "u", ú: "u", ǔ: "u", ù: "u",
  ǖ: "u", ǘ: "u", ǚ: "u", ǜ: "u", ü: "u",
  Ā: "a", Á: "a", Ǎ: "a", À: "a",
  Ē: "e", É: "e", Ě: "e", È: "e",
  Ī: "i", Í: "i", Ǐ: "i", Ì: "i",
  Ō: "o", Ó: "o", Ǒ: "o", Ò: "o",
  Ū: "u", Ú: "u", Ǔ: "u", Ù: "u",
  Ǖ: "u", Ǘ: "u", Ǚ: "u", Ǜ: "u", Ü: "u",
  ń: "n", ň: "n", ǹ: "n",
  ḿ: "m",
};

export function stripPinyinTones(str: string): string {
  if (!str) return "";
  let out = "";
  for (const ch of str) {
    out += PINYIN_TONE_MAP[ch] || ch;
  }
  return out;
}

export function cleanPinyinForMatching(str: string): string {
  if (!str) return "";
  return stripPinyinTones(str)
    .toLowerCase()
    .replace(/[0-9]/g, "")
    .replace(/[^a-z]/g, "");
}
