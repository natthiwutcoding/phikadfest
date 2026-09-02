import type { EventFilters } from "@/lib/types";

/**
 * แปลงตัวกรองอีเวนต์เป็นคีย์ข้อความ สำหรับใช้รวม query ที่ซ้ำกันใน `lib/events.ts`
 *
 * ── ทำไมต้องมีไฟล์นี้ ──
 * React.cache เทียบ argument ด้วย reference — `listEvents({ from: 'x' })` สร้าง object
 * ใหม่ทุกครั้งที่เรียก จึงไม่มีวันตรงกับครั้งก่อนและไม่เกิดการรวม query เลย
 * ต้องแปลงเป็น string ที่ค่าเท่ากันแล้วได้คีย์เดียวกันเสมอ
 *
 * แยกออกมาเป็นไฟล์ของตัวเองเพราะ `lib/events.ts` ลาก `server-only` เข้ามาด้วย
 * จึง import เข้าไปทดสอบไม่ได้ ส่วนไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ล้วน ทดสอบได้ตรงๆ
 *
 * ── กติกาที่ห้ามพลาด ──
 * คีย์ต้องเดินทางไปกลับได้โดยไม่เสียข้อมูล (`parseFilterKey(filterKey(f))` ต้องได้ค่าเดิม)
 * ถ้าตรงนี้พลาด ตัวกรองจะหายไปเงียบๆ แล้วทุกหน้าจะได้ผลลัพธ์ของ "ไม่กรองอะไรเลย"
 * โดยไม่มี error ให้เห็น — เช่นแผงจังหวัดบนแผนที่จะขึ้นจำนวนงานของทั้งภาค
 */

/** ตัวกรองที่เติมค่าตั้งต้นครบทุกช่องแล้ว — ไม่มี undefined จึงผ่าน JSON ได้ครบ */
export interface NormalizedEventFilters {
  provinceSlug: string;
  categorySlug: string;
  /** ISO date 'YYYY-MM-DD' หรือ '' เมื่อไม่จำกัด */
  from: string;
  to: string;
  query: string;
  upcomingOnly: boolean;
  /** 0 = ไม่จำกัดจำนวน */
  limit: number;
}

/**
 * เติมค่าตั้งต้นให้ครบทุกช่อง
 *
 * ค่าว่างใช้ `''` และ `0` แทน undefined เพราะ JSON.stringify ตัดคีย์ที่เป็น undefined ทิ้ง
 * ซึ่งจะทำให้ `{provinceSlug: undefined}` กับ `{}` ได้คีย์เดียวกัน — ตรงนี้ยังถูกอยู่
 * แต่ค่าที่ parse กลับมาจะขาดช่องไป และโค้ดที่รับไปใช้ต่อจะเดาไม่ได้ว่าตั้งใจหรือหลุด
 */
export function normalizeFilters(filters: EventFilters): NormalizedEventFilters {
  return {
    provinceSlug: filters.provinceSlug ?? "",
    categorySlug: filters.categorySlug ?? "",
    from: filters.from ?? "",
    to: filters.to ?? "",
    query: filters.query?.trim() ?? "",
    upcomingOnly: filters.upcomingOnly ?? true,
    limit: filters.limit ?? 0,
  };
}

/**
 * คีย์ข้อความของตัวกรองชุดหนึ่ง
 *
 * ⚠️ ห้ามใช้ JSON.stringify(filters) ตรงๆ — ลำดับคีย์ใน object ขึ้นกับลำดับที่ผู้เรียกเขียน
 * ทำให้ `{from, to}` กับ `{to, from}` ได้คีย์ต่างกันทั้งที่ความหมายเหมือนกัน
 * การประกอบ object ใหม่ที่นี่บังคับลำดับให้คงที่เสมอ
 */
export function filterKey(filters: EventFilters): string {
  return JSON.stringify(normalizeFilters(filters));
}

/** อ่านคีย์กลับเป็นตัวกรอง — คู่กับ filterKey() เท่านั้น */
export function parseFilterKey(key: string): NormalizedEventFilters {
  return JSON.parse(key) as NormalizedEventFilters;
}
