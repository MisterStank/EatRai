import type { Lang } from "../api/client";

export type CatSection = "dish" | "regional" | "vibe" | "intl";
export type Category = { key: string; en: string; th: string; section: CatSection };

// Section order in the filter sheet — most-used first, international last.
export const CAT_SECTIONS: CatSection[] = ["dish", "regional", "vibe", "intl"];

// key must match the backend's categoryQueryText map (internal/places/places.go).
// Grouped by how Thai diners actually pick: a dish first, then region, then the
// kind of place / occasion, with cuisine-by-nation last.
export const CATEGORIES: Category[] = [
  // What dish?
  { key: "tamsang", en: "Rice & stir-fry", th: "ตามสั่ง / ข้าวราดแกง", section: "dish" },
  { key: "noodles", en: "Noodles", th: "ก๋วยเตี๋ยว", section: "dish" },
  { key: "somtam", en: "Som Tam & grilled chicken", th: "ส้มตำ–ไก่ย่าง", section: "dish" },
  { key: "padthai", en: "Pad Thai", th: "ผัดไทย", section: "dish" },
  { key: "moopping", en: "Grilled pork & sticky rice", th: "หมูปิ้ง–ข้าวเหนียว", section: "dish" },
  { key: "khaomankai", en: "Chicken / pork rice", th: "ข้าวมันไก่ / ข้าวหมูแดง", section: "dish" },
  { key: "khakhamoo", en: "Stewed pork leg rice", th: "ข้าวขาหมู", section: "dish" },
  { key: "raadna", en: "Rad Na / Pad See Ew", th: "ราดหน้า–ผัดซีอิ๊ว", section: "dish" },
  { key: "jok", en: "Congee / rice soup", th: "โจ๊ก–ข้าวต้ม", section: "dish" },
  { key: "mala", en: "Mala", th: "หม่าล่า", section: "dish" },
  { key: "seafood", en: "Seafood", th: "ซีฟู้ด", section: "dish" },
  { key: "steak", en: "Steak", th: "สเต็ก", section: "dish" },

  // Thai regional
  { key: "isaan", en: "Isaan / Northeastern", th: "อีสาน", section: "regional" },
  { key: "nuea", en: "Northern (Lanna)", th: "เหนือ", section: "regional" },
  { key: "tai", en: "Southern", th: "ใต้", section: "regional" },
  { key: "thai", en: "Thai (general)", th: "ไทยทั่วไป", section: "regional" },

  // What vibe?
  { key: "street", en: "Street food", th: "สตรีทฟู้ด", section: "vibe" },
  { key: "buffet", en: "Buffet / Shabu / Suki", th: "บุฟเฟต์–ชาบู", section: "vibe" },
  { key: "bbq", en: "Grill / Mookata", th: "ปิ้งย่าง–หมูกระทะ", section: "vibe" },
  { key: "cafe", en: "Café", th: "คาเฟ่", section: "vibe" },
  { key: "drinks", en: "Bubble tea / drinks", th: "ชานม–เครื่องดื่ม", section: "vibe" },
  { key: "bar", en: "Bar / Pub", th: "บาร์", section: "vibe" },
  { key: "dessert", en: "Dessert", th: "ของหวาน", section: "vibe" },
  { key: "vegetarian", en: "Vegetarian / เจ", th: "มังสวิรัติ–เจ", section: "vibe" },

  // International
  { key: "japanese", en: "Japanese", th: "ญี่ปุ่น", section: "intl" },
  { key: "korean", en: "Korean", th: "เกาหลี", section: "intl" },
  { key: "chinese", en: "Chinese", th: "จีน", section: "intl" },
  { key: "indian", en: "Indian", th: "อินเดีย", section: "intl" },
  { key: "italian", en: "Italian", th: "อิตาเลียน", section: "intl" },
  { key: "pizza", en: "Pizza", th: "พิซซ่า", section: "intl" },
  { key: "burgers", en: "Burgers", th: "เบอร์เกอร์", section: "intl" },
];

export const catLabel = (c: Category, lang: Lang) => (lang === "th" ? c.th : c.en);

export const RADII: { m: number }[] = [{ m: 500 }, { m: 1000 }, { m: 2000 }, { m: 5000 }];
