import { PROVINCES, REGION_LABELS } from "@/lib/data/provinces";
import type { Region } from "@/lib/types";

/**
 * ภาคที่เว็บนี้เปิดรับงานอยู่ตอนนี้ — เปลี่ยนค่าเดียวนี้เพื่อขยาย/ย่อขอบเขตทั้งเว็บ
 *
 * แยกไฟล์นี้ออกจาก `provinces.ts` เพราะ "ขอบเขตธุรกิจตอนนี้" ควรอยู่คนละที่กับ
 * "ข้อมูลอ้างอิงทั้งหมด" — provinces.ts ยังมีครบ 77 จังหวัดเสมอ (คู่แฝดกับ SQL seed
 * ห้ามลบ) ส่วนไฟล์นี้แค่ตัดสินว่าตอนนี้เปิดรับงานจากจังหวัดไหนบ้าง
 *
 * วันที่กลับไปทำทั่วประเทศ หรือขยายไปภาคอื่น แก้บรรทัด ACTIVE_REGION เดียวที่นี่
 * ไม่ต้องรื้อแผนที่ ฟอร์ม หรือ schema ที่มีอยู่แล้ว
 */
export const ACTIVE_REGION: Region = "east";

/** ชื่อภาคที่ใช้แสดงผล เช่น "ภาคตะวันออก" — ดึงจากตารางเดียวกับที่ dropdown ใช้ */
export const ACTIVE_REGION_LABEL = REGION_LABELS[ACTIVE_REGION];

/**
 * จังหวัดในขอบเขตปัจจุบัน — ใช้ทำ dropdown ฟอร์มแจ้งงาน และตรวจฝั่งเซิร์ฟเวอร์
 * เรียงตามชื่อไทย เหมือนที่ PROVINCES_BY_REGION ทำ เพื่อให้ผู้ใช้หาในลิสต์ได้ง่าย
 */
export const ACTIVE_PROVINCES = PROVINCES.filter(
  (province) => province.region === ACTIVE_REGION,
).sort((a, b) => a.nameTh.localeCompare(b.nameTh, "th"));

/** รหัส ISO ของจังหวัดในขอบเขต — ใช้คำนวณกรอบแผนที่ใน map-camera.ts */
export const ACTIVE_PROVINCE_CODES = ACTIVE_PROVINCES.map((province) => province.code);

const ACTIVE_PROVINCE_SLUGS = new Set(ACTIVE_PROVINCES.map((province) => province.slug));

/** true เมื่อจังหวัด (ระบุด้วย slug) อยู่ในขอบเขตที่เปิดรับงานอยู่ตอนนี้ */
export function isProvinceInScope(slug: string): boolean {
  return ACTIVE_PROVINCE_SLUGS.has(slug);
}
