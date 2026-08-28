import { cache } from "react";

import { CATEGORIES, getCategory } from "@/lib/data/categories";
import { getProvince, PROVINCES } from "@/lib/data/provinces";
import { getSampleEvents } from "@/lib/data/sample-events";
import { haversineMeters } from "@/lib/geo";
import type { EventFilters, EventWithRelations } from "@/lib/types";

/**
 * ชั้นเข้าถึงข้อมูลอีเวนต์ (data access layer)
 *
 * ตอนนี้อ่านจาก sample data ในเครื่อง เพื่อให้พัฒนา UI ได้โดยยังไม่ต้องมี Supabase
 * เมื่อสร้าง Supabase project แล้ว ให้เปลี่ยนเฉพาะข้างในฟังก์ชันเหล่านี้เป็นการ query จริง
 * โดย signature ต้องเหมือนเดิม — หน้าเว็บทุกหน้าจะทำงานต่อได้ทันทีโดยไม่ต้องแก้
 *
 * ดูขั้นตอนการสลับใน docs/03-data-model.md หัวข้อ "การย้ายจาก sample data ไป Supabase"
 */

/** true เมื่อยังใช้ข้อมูลตัวอย่างอยู่ — ใช้ตัดสินใจว่าจะแสดงแบนเนอร์เตือนหรือไม่ */
export const USING_SAMPLE_DATA = !process.env.NEXT_PUBLIC_SUPABASE_URL;

/**
 * join อีเวนต์เข้ากับจังหวัดและหมวดหมู่
 *
 * ทิ้งแถวที่ชี้ไปยัง slug ที่ไม่มีอยู่จริง แทนที่จะ throw
 * เพราะข้อมูลหนึ่งแถวเสียไม่ควรทำให้ทั้งหน้าพัง
 */
function withRelations(events: ReturnType<typeof getSampleEvents>): EventWithRelations[] {
  return events.flatMap((event) => {
    const province = getProvince(event.provinceSlug);
    const category = getCategory(event.categorySlug);
    if (!province || !category) return [];
    return [{ ...event, province, category }];
  });
}

/**
 * React.cache ทำให้การเรียกซ้ำภายใน request เดียวใช้ผลลัพธ์เดิม
 * มีผลจริงตอนที่หน้า detail เรียกทั้งใน generateMetadata และในตัว component
 */
const loadApprovedEvents = cache(async (): Promise<EventWithRelations[]> => {
  const events = getSampleEvents().filter((event) => event.status === "approved");
  return withRelations(events);
});

/** ค้นหาอีเวนต์ตามเงื่อนไข เรียงตามวันที่เริ่มจากใกล้ที่สุด */
export async function listEvents(filters: EventFilters = {}): Promise<EventWithRelations[]> {
  const { upcomingOnly = true, limit } = filters;
  const now = Date.now();

  let results = await loadApprovedEvents();

  if (upcomingOnly) {
    // ใช้ endAt ไม่ใช่ startAt — งานหลายวันที่เริ่มไปแล้วแต่ยังไม่จบ ยังไปทันอยู่
    results = results.filter((event) => Date.parse(event.endAt) >= now);
  }

  if (filters.provinceSlug) {
    results = results.filter((event) => event.provinceSlug === filters.provinceSlug);
  }

  if (filters.region) {
    results = results.filter((event) => event.province.region === filters.region);
  }

  if (filters.categorySlug) {
    results = results.filter((event) => event.categorySlug === filters.categorySlug);
  }

  if (filters.from) {
    const from = Date.parse(`${filters.from}T00:00:00+07:00`);
    results = results.filter((event) => Date.parse(event.endAt) >= from);
  }

  if (filters.to) {
    const to = Date.parse(`${filters.to}T23:59:59+07:00`);
    results = results.filter((event) => Date.parse(event.startAt) <= to);
  }

  if (filters.query) {
    const needle = filters.query.trim().toLowerCase();
    if (needle) {
      results = results.filter((event) =>
        [event.title, event.description, event.venueName, event.province.nameTh]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(needle)),
      );
    }
  }

  results = [...results].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

  return limit ? results.slice(0, limit) : results;
}

export async function getEventBySlug(slug: string): Promise<EventWithRelations | null> {
  const events = await loadApprovedEvents();
  return events.find((event) => event.slug === slug) ?? null;
}

/**
 * งานที่อยู่ใกล้พิกัดที่กำหนด เรียงจากใกล้ไปไกล
 *
 * เมื่อย้ายไป Supabase ให้แทนที่ด้วย supabase.rpc('events_nearby', {...})
 * ซึ่งมี signature ตรงกับพารามิเตอร์ชุดนี้ (ดู 0001_init.sql)
 */
export async function findNearbyEvents(options: {
  lat: number;
  lng: number;
  radiusM?: number;
  limit?: number;
  categorySlug?: string;
}): Promise<EventWithRelations[]> {
  const { lat, lng, radiusM = 100_000, limit = 20, categorySlug } = options;

  const events = await listEvents({ categorySlug, upcomingOnly: true });

  return events
    .flatMap((event) => {
      // งานที่ไม่มีพิกัดของตัวเอง ใช้พิกัดตัวเมืองของจังหวัดแทน
      // ดีกว่าตัดทิ้ง เพราะผู้ใช้ยังอยากรู้ว่ามีงานอยู่แถวนั้น
      const eventLat = event.lat ?? event.province.lat;
      const eventLng = event.lng ?? event.province.lng;

      const distanceM = haversineMeters(lat, lng, eventLat, eventLng);
      if (distanceM > radiusM) return [];

      return [{ ...event, distanceM }];
    })
    .sort((a, b) => a.distanceM! - b.distanceM!)
    .slice(0, limit);
}

/** จำนวนงานที่กำลังจะมาถึง แยกตามหมวดหมู่ — ใช้แสดงตัวเลขบนปุ่มกรอง */
export async function countEventsByCategory(): Promise<Map<string, number>> {
  const events = await listEvents();
  const counts = new Map<string, number>();

  for (const event of events) {
    counts.set(event.categorySlug, (counts.get(event.categorySlug) ?? 0) + 1);
  }

  return counts;
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

/**
 * สรุปจำนวนงานและวันที่ใกล้ที่สุด แยกตามจังหวัด — ใช้ในหน้าแผนที่
 *
 * คืนเฉพาะจังหวัดที่มีงานจริง (ไม่ใช่ครบ 77) เพื่อลดข้อมูลที่ส่งไปเบราว์เซอร์
 * ตัวแผนที่วาดครบทุกจังหวัดอยู่แล้วจาก PROVINCE_PATHS จังหวัดที่ไม่อยู่ในผลลัพธ์นี้
 * จะถูกวาดเป็นสีพื้นว่างเปล่า
 */
export async function getProvinceEventSummary(
  filters: Pick<EventFilters, "from" | "to"> = {},
): Promise<ProvinceEventSummary[]> {
  const events = await listEvents(filters);
  const byProvince = new Map<string, { count: number; nextEventAt: string }>();

  for (const event of events) {
    const existing = byProvince.get(event.provinceSlug);

    if (!existing) {
      byProvince.set(event.provinceSlug, { count: 1, nextEventAt: event.startAt });
      continue;
    }

    existing.count += 1;
    // listEvents เรียงตาม startAt อยู่แล้ว แต่เทียบไว้อีกชั้นเผื่อลำดับเปลี่ยนในอนาคต
    if (Date.parse(event.startAt) < Date.parse(existing.nextEventAt)) {
      existing.nextEventAt = event.startAt;
    }
  }

  return PROVINCES.filter((province) => byProvince.has(province.slug)).map((province) => {
    const summary = byProvince.get(province.slug)!;
    return {
      code: province.code,
      slug: province.slug,
      nameTh: province.nameTh,
      count: summary.count,
      nextEventAt: summary.nextEventAt,
    };
  });
}

/** จังหวัดที่มีงานกำลังจะมาถึง พร้อมจำนวน — ใช้ทำหน้าแรกและ sitemap */
export async function listProvincesWithEvents(): Promise<
  { slug: string; nameTh: string; count: number }[]
> {
  const events = await listEvents();
  const counts = new Map<string, number>();

  for (const event of events) {
    counts.set(event.provinceSlug, (counts.get(event.provinceSlug) ?? 0) + 1);
  }

  return PROVINCES.filter((province) => counts.has(province.slug))
    .map((province) => ({
      slug: province.slug,
      nameTh: province.nameTh,
      count: counts.get(province.slug)!,
    }))
    .sort((a, b) => b.count - a.count);
}

export { CATEGORIES, PROVINCES };
