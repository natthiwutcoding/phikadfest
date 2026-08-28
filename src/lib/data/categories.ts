import type { Category } from "@/lib/types";

/**
 * หมวดหมู่งาน — คู่แฝดของ supabase/migrations/0002_seed_reference.sql
 *
 * เก็บเป็นตาราง (ไม่ใช่ enum) ทั้งใน DB และที่นี่ เพื่อให้เพิ่มหมวดใหม่ได้
 * โดยไม่ต้อง migrate schema
 *
 * accentColor เลือกให้แต่ละหมวดแยกจากกันด้วยตาชัดเจนบนพื้นเข้ม (ธีม Dark)
 * และใช้เป็นสีพื้นของภาพประกอบการ์ดงานด้วย (ดู event-cover.tsx)
 */
export const CATEGORIES: Category[] = [
  { id: 1, slug: "annual-fair", nameTh: "งานประจำปี / งานวัด", nameEn: "Annual Fair", emoji: "🎡", sortOrder: 10, accentColor: "#f59e0b" },
  { id: 2, slug: "music", nameTh: "ดนตรี / คอนเสิร์ต", nameEn: "Music", emoji: "🎵", sortOrder: 20, accentColor: "#a855f7" },
  { id: 3, slug: "workshop", nameTh: "เวิร์กช็อป / เรียนรู้", nameEn: "Workshop", emoji: "🛠️", sortOrder: 30, accentColor: "#0ea5e9" },
  { id: 4, slug: "car-meet", nameTh: "รถซิ่ง / คาร์มีท", nameEn: "Car Meet", emoji: "🏁", sortOrder: 40, accentColor: "#ef4444" },
  { id: 5, slug: "food", nameTh: "อาหาร / ตลาดนัด", nameEn: "Food & Market", emoji: "🍜", sortOrder: 50, accentColor: "#f97316" },
  { id: 6, slug: "culture", nameTh: "ประเพณี / วัฒนธรรม", nameEn: "Culture", emoji: "🪷", sortOrder: 60, accentColor: "#e11d48" },
  { id: 7, slug: "sport", nameTh: "กีฬา / วิ่ง", nameEn: "Sports", emoji: "🏃", sortOrder: 70, accentColor: "#22c55e" },
  { id: 8, slug: "art", nameTh: "ศิลปะ / นิทรรศการ", nameEn: "Art & Exhibition", emoji: "🎨", sortOrder: 80, accentColor: "#6366f1" },
  { id: 9, slug: "other", nameTh: "อื่นๆ", nameEn: "Other", emoji: "✨", sortOrder: 999, accentColor: "#78716c" },
];

const BY_SLUG = new Map(CATEGORIES.map((c) => [c.slug, c]));

export function getCategory(slug: string): Category | undefined {
  return BY_SLUG.get(slug);
}
