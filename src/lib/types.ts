/**
 * Domain types ของ Phikadfest
 *
 * ตั้งใจให้ตรงกับ schema ใน supabase/migrations/0001_init.sql
 * แต่ใช้ camelCase ตามธรรมเนียม TypeScript (ฝั่ง DB ใช้ snake_case)
 */

export type Region = "north" | "northeast" | "central" | "east" | "west" | "south";

export type EventStatus = "draft" | "pending" | "approved" | "rejected" | "archived";

export interface Province {
  id: number;
  /** ISO 3166-2:TH เช่น 'TH-50' */
  code: string;
  /** ใช้ใน URL เช่น 'chiang-mai' */
  slug: string;
  nameTh: string;
  nameEn: string;
  region: Region;
  /** พิกัดตัวเมือง ใช้เป็น fallback เมื่ออีเวนต์ไม่มีพิกัดของตัวเอง */
  lat: number;
  lng: number;
}

export interface Category {
  id: number;
  slug: string;
  nameTh: string;
  nameEn: string;
  emoji: string;
  sortOrder: number;
  /** สี accent ประจำหมวดหมู่ (hex) ใช้ทำภาพประกอบการ์ดและ badge ให้แยกแยะง่ายด้วยตา */
  accentColor: string;
}

export interface EventRecord {
  id: string;
  /** URL ที่อ่านออก ดีต่อ SEO เช่น 'loi-krathong-sukhothai-2569' */
  slug: string;
  title: string;
  description: string;

  categorySlug: string;
  provinceSlug: string;
  district?: string;
  venueName?: string;
  address?: string;
  lat?: number;
  lng?: number;

  /** ISO 8601 พร้อม offset เช่น '2026-11-14T18:00:00+07:00' */
  startAt: string;
  endAt: string;
  /** งานที่ประกาศแค่วัน ไม่ประกาศเวลาเริ่ม */
  isAllDay: boolean;

  coverImageUrl?: string;
  ticketUrl?: string;
  isFree: boolean;
  priceMin?: number;
  priceMax?: number;

  organizerName?: string;
  sourceUrl?: string;

  status: EventStatus;
}

/** อีเวนต์ที่ผ่านการ join กับจังหวัด/หมวดหมู่แล้ว — รูปแบบที่ UI ใช้จริง */
export interface EventWithRelations extends EventRecord {
  province: Province;
  category: Category;
  /** ระยะทางเป็นเมตร มีเฉพาะตอนค้นแบบ "ใกล้ฉัน" */
  distanceM?: number;
}

export interface EventFilters {
  provinceSlug?: string;
  categorySlug?: string;
  region?: Region;
  /** ISO date 'YYYY-MM-DD' */
  from?: string;
  to?: string;
  query?: string;
  /** true = แสดงเฉพาะงานที่ยังไม่จบ (ค่าตั้งต้น) */
  upcomingOnly?: boolean;
  limit?: number;
}
