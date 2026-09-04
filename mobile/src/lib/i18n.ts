import { useCallback } from "react";
import { useSession } from "../store/session";
import type { Lang } from "../api/client";

const en = {
  langLabel: "ไทย",
  otherLangLabel: "TH",

  nearYou: "Near you",

  // filters
  filters: "Filters",
  reset: "Reset",
  intoWhat: "What are you into?",
  howFar: "How far?",
  minRatingLabel: "Minimum rating",
  anyRating: "Any",
  priceLabel: "Price",
  sortLabel: "Sort by",
  sortNearest: "Nearest",
  sortBest: "Best match",
  openNowOnly: "Open now only",
  showRestaurants: "Show restaurants",

  // deck states
  needLocation: "Location permission is needed to find restaurants near you.",
  locationFailed: "Couldn't get your location. Check location services and try again.",
  locationTimedOut: "Getting your location is taking a while. Try again, or search an area.",
  loadFailed: "Couldn't load restaurants.",
  tooMany: "Too many requests just now — wait a minute and try again.",
  noneWithFilters: "Nothing here with those filters — widen the radius or clear a category.",
  allDone: "That's everyone nearby.",
  allDoneNoLikes: "That's everyone nearby — nothing caught your eye.",
  tryAgain: "Try again",
  startOver: "Widen the search",
  seeYourN: "See your {n}",
  nLiked: "See your {n} liked places",
  howToUse: "How to use",

  // decide
  decideForMe: "Decide for me",
  decideFromSaved: "Decide from your {n} saved",
  decideKicker: "Eat at",
  decideFromLikes: "picked from your saved places",
  decideFromNearby: "picked from what's nearby",
  decideAgain: "Not this one",
  decideDetails: "See details",

  // location picker
  changeLocation: "Change location",
  searchArea: "Search a neighbourhood or place",
  useMyLocation: "Use my current location",
  noAreaMatch: "Couldn't find that. Try another name.",
  search: "Search",
  confirmLocation: "Search here",
  pinnedNear: "Near {area}",
  pinnedHere: "Dropped pin here",
  recentSearches: "Recent",

  // hint
  swipeHint: "Swipe to choose. Tap the photo to see more, tap the name for details.",
  gotIt: "Got it",

  // help sheet
  helpTitle: "How to use",
  helpIntro: "Find somewhere to eat in a few swipes.",
  helpSwipeTitle: "Swipe or tap",
  helpSwipeBody: "Swipe right to save a place, left to skip. Or use the buttons at the bottom.",
  helpMoreTitle: "See more",
  helpMoreBody: "Tap the photo to flip through pictures. Tap the name for details, hours and directions.",
  helpUndoTitle: "Undo",
  helpUndoBody: "Hit the back arrow to take back your last swipe.",
  helpAreaTitle: "Change the area",
  helpAreaBody: "Tap the location pill up top to search anywhere or drop a pin on the map.",
  helpFiltersTitle: "Filters",
  helpFiltersBody: "Tap the slider icon to set cuisine, distance, rating, price and open-now.",
  helpDecideTitle: "Can't decide?",
  helpDecideBody: "\"Decide for me\" picks one of your saved places at random.",
  helpListTitle: "Your list",
  helpListBody: "Saved places live on this device only — not synced, and cleared if you delete the app.",

  // card / status
  open: "Open now",
  closed: "Closed",
  yourTaste: "LIKE",
  pass: "NOPE",

  // saved
  saved: "Saved",
  savedSub: "Tap a place for details, hours and directions.",
  nPlaces: "{n} places",
  keepSwiping: "Keep swiping",
  clearAll: "Clear all",
  clearTitle: "Clear your list?",
  clearBody: "This removes all saved places on this device.",
  cancel: "Cancel",
  nothingSaved: "Nothing yet — swipe right on a place you like.",
  savedNote: "Saved on this device — not synced, cleared if you delete the app.",
  shareList: "Share list",
  linkCopied: "Link copied",

  // detail sheet
  call: "Call",
  website: "Website",
  directions: "Directions",
  hours: "Hours",
  reviews: "reviews",
  openInMaps: "Open in Maps",

  // shared list
  sharedWithYou: "Shared with you",
  openEatRai: "Open EatRai",
  loadingList: "Loading…",
  listTruncated: "Showing the first 25 places.",

  // a11y
  a11yUndo: "Undo",
  a11yPass: "Pass",
  a11yLike: "Like",
  a11yDirections: "Directions",
  a11yFilters: "Filters",
  a11yHelp: "How to use",
  a11yLanguage: "Switch language",
  a11yDecide: "Decide for me",
  a11yPhotoNext: "Next photo",
  a11yPhotoPrev: "Previous photo",
  a11yRestaurantCard: "{name}. Swipe right to save, left to pass.",
};

type Key = keyof typeof en;

const th: Record<Key, string> = {
  langLabel: "ไทย",
  otherLangLabel: "EN",

  nearYou: "ใกล้คุณ",

  filters: "ตัวกรอง",
  reset: "ล้าง",
  intoWhat: "อยากกินอะไร?",
  howFar: "ระยะทาง",
  minRatingLabel: "คะแนนขั้นต่ำ",
  anyRating: "ทั้งหมด",
  priceLabel: "ราคา",
  sortLabel: "เรียงตาม",
  sortNearest: "ใกล้สุด",
  sortBest: "ตรงที่สุด",
  openNowOnly: "เฉพาะร้านที่เปิดอยู่",
  showRestaurants: "ดูร้านอาหาร",

  needLocation: "ต้องเปิดสิทธิ์ตำแหน่งเพื่อค้นหาร้านอาหารใกล้คุณ",
  locationFailed: "ไม่สามารถระบุตำแหน่งได้ ตรวจสอบบริการตำแหน่งแล้วลองใหม่",
  locationTimedOut: "ระบุตำแหน่งใช้เวลานาน ลองใหม่ หรือค้นหาย่านที่ต้องการ",
  loadFailed: "โหลดร้านอาหารไม่สำเร็จ",
  tooMany: "มีคำขอมากเกินไป รอสักครู่แล้วลองใหม่",
  noneWithFilters: "ไม่พบร้านตามตัวกรองนี้ — ลองเพิ่มระยะทางหรือเอาหมวดหมู่ออก",
  allDone: "หมดแล้วสำหรับแถวนี้",
  allDoneNoLikes: "หมดแล้วสำหรับแถวนี้ — ยังไม่เจอร้านที่ถูกใจ",
  tryAgain: "ลองอีกครั้ง",
  startOver: "ขยายพื้นที่ค้นหา",
  seeYourN: "ดู {n} ร้านที่ชอบ",
  nLiked: "ดู {n} ร้านที่ชอบ",
  howToUse: "วิธีใช้",

  decideForMe: "เลือกให้เลย",
  decideFromSaved: "เลือกให้จาก {n} ร้านที่บันทึก",
  decideKicker: "ไปกินที่",
  decideFromLikes: "สุ่มจากร้านที่คุณบันทึกไว้",
  decideFromNearby: "สุ่มจากร้านแถวนี้",
  decideAgain: "เอาร้านอื่น",
  decideDetails: "ดูรายละเอียด",

  changeLocation: "เปลี่ยนตำแหน่ง",
  searchArea: "ค้นหาย่านหรือสถานที่",
  useMyLocation: "ใช้ตำแหน่งปัจจุบัน",
  noAreaMatch: "ไม่พบสถานที่นั้น ลองชื่ออื่น",
  search: "ค้นหา",
  confirmLocation: "ค้นหาที่นี่",
  pinnedNear: "ใกล้ {area}",
  pinnedHere: "ปักหมุดตรงนี้",
  recentSearches: "ล่าสุด",

  swipeHint: "ปัดเพื่อเลือก แตะรูปเพื่อดูเพิ่ม แตะชื่อเพื่อดูรายละเอียด",
  gotIt: "เข้าใจแล้ว",

  helpTitle: "วิธีใช้",
  helpIntro: "หาร้านกินได้ในไม่กี่ปัด",
  helpSwipeTitle: "ปัดหรือแตะ",
  helpSwipeBody: "ปัดขวาเพื่อบันทึกร้าน ปัดซ้ายเพื่อข้าม หรือใช้ปุ่มด้านล่าง",
  helpMoreTitle: "ดูเพิ่มเติม",
  helpMoreBody: "แตะรูปเพื่อดูรูปอื่น แตะชื่อร้านเพื่อดูรายละเอียด เวลาเปิด และเส้นทาง",
  helpUndoTitle: "ย้อนกลับ",
  helpUndoBody: "แตะปุ่มลูกศรย้อนกลับเพื่อยกเลิกการปัดครั้งล่าสุด",
  helpAreaTitle: "เปลี่ยนพื้นที่",
  helpAreaBody: "แตะป้ายตำแหน่งด้านบนเพื่อค้นหาพื้นที่อื่นหรือปักหมุดบนแผนที่",
  helpFiltersTitle: "ตัวกรอง",
  helpFiltersBody: "แตะไอคอนสไลเดอร์เพื่อตั้งประเภทอาหาร ระยะทาง คะแนน ราคา และร้านที่เปิดอยู่",
  helpDecideTitle: "เลือกไม่ถูก?",
  helpDecideBody: "“เลือกให้เลย” จะสุ่มร้านหนึ่งจากร้านที่คุณบันทึกไว้",
  helpListTitle: "รายการของคุณ",
  helpListBody: "ร้านที่บันทึกไว้จะอยู่ในเครื่องนี้เท่านั้น ไม่ซิงก์ และจะหายเมื่อลบแอป",

  open: "เปิดอยู่",
  closed: "ปิดอยู่",
  yourTaste: "ชอบ",
  pass: "ผ่าน",

  saved: "บันทึกไว้",
  savedSub: "แตะที่ร้านเพื่อดูรายละเอียด เวลาเปิด และเส้นทาง",
  nPlaces: "{n} ร้าน",
  keepSwiping: "ปัดต่อ",
  clearAll: "ล้างทั้งหมด",
  clearTitle: "ล้างรายการ?",
  clearBody: "ลบร้านที่บันทึกไว้ทั้งหมดในเครื่องนี้",
  cancel: "ยกเลิก",
  nothingSaved: "ยังไม่มี — ปัดขวาร้านที่คุณชอบ",
  savedNote: "บันทึกในเครื่องนี้ ไม่ซิงก์ และจะหายเมื่อลบแอป",
  shareList: "แชร์รายการ",
  linkCopied: "คัดลอกลิงก์แล้ว",

  call: "โทร",
  website: "เว็บไซต์",
  directions: "เส้นทาง",
  hours: "เวลาทำการ",
  reviews: "รีวิว",
  openInMaps: "เปิดใน Maps",

  sharedWithYou: "มีคนแชร์ให้คุณ",
  openEatRai: "เปิด EatRai",
  loadingList: "กำลังโหลด…",
  listTruncated: "แสดง 25 ร้านแรก",

  a11yUndo: "ย้อนกลับ",
  a11yPass: "ผ่าน",
  a11yLike: "ชอบ",
  a11yDirections: "เส้นทาง",
  a11yFilters: "ตัวกรอง",
  a11yHelp: "วิธีใช้",
  a11yLanguage: "เปลี่ยนภาษา",
  a11yDecide: "เลือกให้เลย",
  a11yPhotoNext: "รูปถัดไป",
  a11yPhotoPrev: "รูปก่อนหน้า",
  a11yRestaurantCard: "{name} ปัดขวาเพื่อบันทึก ปัดซ้ายเพื่อผ่าน",
};

const dict: Record<Lang, Record<Key, string>> = { en, th };

export function translate(lang: Lang, key: Key, vars?: Record<string, string | number>): string {
  let s = dict[lang][key] ?? dict.en[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.replace(`{${k}}`, String(vars[k]));
  return s;
}

export function useT() {
  const lang = useSession((s) => s.lang);
  return useCallback(
    (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );
}

export type TKey = Key;
