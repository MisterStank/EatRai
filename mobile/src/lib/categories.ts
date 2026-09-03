import type { Lang } from "../api/client";

export type Category = { key: string; en: string; th: string };

// key must match the backend's categoryTypes map (internal/places/places.go).
export const CATEGORIES: Category[] = [
  { key: "thai", en: "Thai", th: "ไทย" },
  { key: "isaan", en: "Isaan / Northeastern", th: "อีสาน" },
  { key: "noodles", en: "Noodles", th: "ก๋วยเตี๋ยว" },
  { key: "street", en: "Street food", th: "สตรีทฟู้ด" },
  { key: "seafood", en: "Seafood", th: "ซีฟู้ด" },
  { key: "japanese", en: "Japanese", th: "ญี่ปุ่น" },
  { key: "cafe", en: "Café", th: "คาเฟ่" },
  { key: "bar", en: "Bar", th: "บาร์" },
  { key: "bbq", en: "Grill / BBQ", th: "ปิ้งย่าง" },
  { key: "dessert", en: "Dessert", th: "ของหวาน" },
  { key: "vegetarian", en: "Vegetarian", th: "มังสวิรัติ" },
  { key: "chinese", en: "Chinese", th: "จีน" },
  { key: "korean", en: "Korean", th: "เกาหลี" },
  { key: "indian", en: "Indian", th: "อินเดีย" },
  { key: "italian", en: "Italian", th: "อิตาเลียน" },
  { key: "pizza", en: "Pizza", th: "พิซซ่า" },
  { key: "burgers", en: "Burgers", th: "เบอร์เกอร์" },
];

export const catLabel = (c: Category, lang: Lang) => (lang === "th" ? c.th : c.en);

export const RADII: { m: number }[] = [{ m: 500 }, { m: 1000 }, { m: 2000 }, { m: 5000 }];
