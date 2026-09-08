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

/**
 * งานหนึ่งรายการที่มีพิกัด พอสำหรับปักหมุดและแสดงการ์ดเล็กบนแผนที่
 *
 * ตัดฟิลด์ที่แผนที่ไม่ได้ใช้ออก (คำอธิบาย ที่อยู่ ลิงก์บัตร ฯลฯ) เพราะข้อมูลชุดนี้
 * ถูกส่งข้ามไปฝั่งเบราว์เซอร์ทั้งก้อนเพื่อวาดหมุด — ยิ่งเบายิ่งดีต่อเวลาโหลดหน้าแผนที่
 */
export interface MapPinEvent {
  id: string;
  slug: string;
  title: string;
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  venueName?: string;
  isFree: boolean;
  priceMin?: number;
  priceMax?: number;
  lat: number;
  lng: number;
  categoryNameTh: string;
  categoryEmoji: string;
  categoryColor: string;
}

/**
 * งานในมุมมองของแอดมิน — เพิ่มฟิลด์ที่หน้าสาธารณะไม่ได้ใช้
 *
 * ต่างจาก EventWithRelations ตรงที่ `status` เป็นสถานะจริงจากฐานข้อมูล ไม่ใช่ 'approved'
 * ตายตัว เพราะหน้าแอดมินต้องเห็นงานทุกสถานะรวมถึงที่ยังไม่อนุมัติ
 */
export interface AdminEvent extends EventWithRelations {
  /** ช่องทางติดต่อผู้จัด — ไม่แสดงบนหน้าเว็บ ใช้ตรวจสอบข้อมูลก่อนอนุมัติเท่านั้น */
  organizerContact?: string;
  /** ISO timestamp ที่งานถูกส่งเข้ามา — ใช้เรียงคิวตรวจ */
  createdAt: string;
}

/** สรุปงานของหนึ่งจังหวัด สำหรับระบายสีและแสดงป้ายบนแผนที่ */
export interface ProvinceEventSummary {
  /** ISO 3166-2 เช่น 'TH-50' — ใช้เป็น key เชื่อมกับ PROVINCE_PATHS */
  code: string;
  slug: string;
  nameTh: string;
  count: number;
  /** ISO timestamp ของงานที่จะถึงเร็วที่สุดในจังหวัดนี้ */
  nextEventAt: string;
}

export interface EventFilters {
  provinceSlug?: string;
  categorySlug?: string;
  /*
    ตั้งใจไม่มี region ให้เลือก — ขอบเขตภาคถูกบังคับตายตัวจาก lib/region-scope.ts
    ที่ listEvents() แล้ว การมีพารามิเตอร์ที่ไม่มีผลไว้จะทำให้เข้าใจผิดว่ายังเลือกภาคได้
  */
  /** ISO date 'YYYY-MM-DD' */
  from?: string;
  to?: string;
  query?: string;
  /** true = แสดงเฉพาะงานที่ยังไม่จบ (ค่าตั้งต้น) */
  upcomingOnly?: boolean;
  limit?: number;
}
