import { cache } from "react";

import { CATEGORIES, getCategory } from "@/lib/data/categories";
import { getProvince, PROVINCES } from "@/lib/data/provinces";
import { getSampleEvents } from "@/lib/data/sample-events";
import { haversineMeters } from "@/lib/geo";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { EventFilters, EventRecord, EventWithRelations } from "@/lib/types";

/**
 * ชั้นเข้าถึงข้อมูลอีเวนต์ (data access layer)
 *
 * ทุกหน้าอ่านข้อมูลผ่านไฟล์นี้เท่านั้น ห้าม query จาก page component โดยตรง
 * เพราะไฟล์นี้เป็นจุดเดียวที่ตัดสินใจว่าจะดึงจาก Supabase หรือ sample data
 *
 * ถ้ายังไม่ได้ตั้งค่า NEXT_PUBLIC_SUPABASE_URL จะ fallback ไปใช้ข้อมูลตัวอย่างในเครื่อง
 * ทำให้พัฒนา UI ต่อได้โดยไม่ต้องมีฐานข้อมูล และมีแบนเนอร์เตือนขึ้นทุกหน้า
 */

/** true เมื่อยังใช้ข้อมูลตัวอย่างอยู่ — ใช้ตัดสินใจว่าจะแสดงแบนเนอร์เตือนหรือไม่ */
export const USING_SAMPLE_DATA = !process.env.NEXT_PUBLIC_SUPABASE_URL;

/** คอลัมน์ที่ดึงจากตาราง events — ต้องตรงกับที่ฟังก์ชัน events_nearby คืนมาด้วย */
const EVENT_COLUMNS = `
  id, slug, title, description,
  category_id, province_id, district, venue_name, address, lat, lng,
  start_at, end_at, is_all_day,
  cover_image_url, ticket_url, is_free, price_min, price_max,
  organizer_name, source_url
`;

/** รูปแบบข้อมูลดิบที่ได้จากฐานข้อมูล — snake_case ตามชื่อคอลัมน์จริง */
interface EventRow {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  category_id: number;
  province_id: number;
  district: string | null;
  venue_name: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  cover_image_url: string | null;
  ticket_url: string | null;
  is_free: boolean;
  price_min: number | null;
  price_max: number | null;
  organizer_name: string | null;
  source_url: string | null;
  distance_m?: number;
}

/** ตารางค้นหาจังหวัด/หมวดหมู่จาก id — สร้างครั้งเดียวตอนโหลดโมดูล */
const PROVINCE_BY_ID = new Map(PROVINCES.map((province) => [province.id, province]));
const CATEGORY_BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

/** แปลง null ของ SQL เป็น undefined ให้ตรงกับ type ฝั่ง TypeScript */
const orUndefined = <T,>(value: T | null): T | undefined => value ?? undefined;

/**
 * แปลงแถวจากฐานข้อมูลเป็นรูปแบบที่ UI ใช้
 *
 * ชื่อจังหวัดและหมวดหมู่ไม่ได้ join มาจาก DB แต่ประกอบจากค่าคงที่ในแอป
 * (`src/lib/data/provinces.ts` และ `categories.ts`) เพราะสองไฟล์นั้นเป็นคู่แฝดกับ
 * SQL seed อยู่แล้ว การไม่ join ทำให้ query เบากว่าและได้ค่าที่ตรงกับที่ UI ใช้แสดงผลเสมอ
 *
 * คืน null เมื่อ id ไม่ตรงกับค่าคงที่ในแอป ตัวเรียกจะทิ้งแถวนั้นไป
 * ดีกว่า throw เพราะข้อมูลหนึ่งแถวเสียไม่ควรทำให้ทั้งหน้าพัง
 */
function toEvent(row: EventRow): EventWithRelations | null {
  const province = PROVINCE_BY_ID.get(row.province_id);
  const category = CATEGORY_BY_ID.get(row.category_id);
  if (!province || !category) return null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description ?? "",
    categorySlug: category.slug,
    provinceSlug: province.slug,
    district: orUndefined(row.district),
    venueName: orUndefined(row.venue_name),
    address: orUndefined(row.address),
    lat: orUndefined(row.lat),
    lng: orUndefined(row.lng),
    startAt: row.start_at,
    endAt: row.end_at,
    isAllDay: row.is_all_day,
    coverImageUrl: orUndefined(row.cover_image_url),
    ticketUrl: orUndefined(row.ticket_url),
    isFree: row.is_free,
    priceMin: orUndefined(row.price_min),
    priceMax: orUndefined(row.price_max),
    organizerName: orUndefined(row.organizer_name),
    sourceUrl: orUndefined(row.source_url),
    // ฟังก์ชันเหล่านี้ดึงเฉพาะงานที่อนุมัติแล้วเสมอ (บังคับซ้ำด้วย RLS ที่ฐานข้อมูล)
    status: "approved",
    province,
    category,
    distanceM: row.distance_m,
  };
}

// ---------------------------------------------------------------------------
// โหมดข้อมูลตัวอย่าง (ใช้เมื่อยังไม่ได้ตั้งค่า Supabase)
// ---------------------------------------------------------------------------

const loadSampleEvents = cache(async (): Promise<EventWithRelations[]> => {
  return getSampleEvents()
    .filter((event) => event.status === "approved")
    .flatMap((event) => {
      const province = getProvince(event.provinceSlug);
      const category = getCategory(event.categorySlug);
      if (!province || !category) return [];
      return [{ ...event, province, category }];
    });
});

/** กรองข้อมูลตัวอย่างด้วย JavaScript — ตรรกะเดียวกับที่ฐานข้อมูลทำให้ในโหมดจริง */
function filterSampleEvents(
  events: EventWithRelations[],
  filters: EventFilters,
): EventWithRelations[] {
  const { upcomingOnly = true } = filters;
  let results = events;

  if (upcomingOnly) {
    const now = Date.now();
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

  const needle = filters.query?.trim().toLowerCase();
  if (needle) {
    results = results.filter((event) =>
      [event.title, event.description, event.venueName, event.province.nameTh]
        .filter(Boolean)
        .some((field) => field!.toLowerCase().includes(needle)),
    );
  }

  return [...results].sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

// ---------------------------------------------------------------------------
// API ที่หน้าเว็บเรียกใช้
// ---------------------------------------------------------------------------

/** ค้นหาอีเวนต์ตามเงื่อนไข เรียงตามวันที่เริ่มจากใกล้ที่สุด */
export async function listEvents(filters: EventFilters = {}): Promise<EventWithRelations[]> {
  const { upcomingOnly = true, limit } = filters;

  if (USING_SAMPLE_DATA) {
    const results = filterSampleEvents(await loadSampleEvents(), filters);
    return limit ? results.slice(0, limit) : results;
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("events").select(EVENT_COLUMNS).eq("status", "approved");

  if (upcomingOnly) {
    query = query.gte("end_at", new Date().toISOString());
  }

  // แปลง slug เป็น id ก่อนกรอง เพราะตาราง events เก็บเป็น foreign key ไม่ใช่ slug
  if (filters.provinceSlug) {
    const province = getProvince(filters.provinceSlug);
    if (!province) return [];
    query = query.eq("province_id", province.id);
  }

  if (filters.categorySlug) {
    const category = getCategory(filters.categorySlug);
    if (!category) return [];
    query = query.eq("category_id", category.id);
  }

  if (filters.region) {
    const ids = PROVINCES.filter((p) => p.region === filters.region).map((p) => p.id);
    query = query.in("province_id", ids);
  }

  if (filters.from) {
    query = query.gte("end_at", `${filters.from}T00:00:00+07:00`);
  }
  if (filters.to) {
    query = query.lte("start_at", `${filters.to}T23:59:59+07:00`);
  }

  const needle = filters.query?.trim();
  if (needle) {
    // ilike ค้นแบบไม่สนตัวพิมพ์ใหญ่เล็ก และใช้กับภาษาไทยได้
    // (full-text search ของ Postgres ตัดคำไทยไม่ได้ — ดูเหตุผลใน docs/02-tech-stack.md)
    const pattern = `%${needle}%`;
    query = query.or(
      `title.ilike.${pattern},description.ilike.${pattern},venue_name.ilike.${pattern}`,
    );
  }

  query = query.order("start_at", { ascending: true });
  if (limit) query = query.limit(limit);

  const { data, error } = await query;
  if (error) {
    console.error("[events] listEvents ล้มเหลว:", error.message);
    return [];
  }

  return (data as unknown as EventRow[]).flatMap((row) => toEvent(row) ?? []);
}

export async function getEventBySlug(slug: string): Promise<EventWithRelations | null> {
  if (USING_SAMPLE_DATA) {
    const events = await loadSampleEvents();
    return events.find((event) => event.slug === slug) ?? null;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("status", "approved")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("[events] getEventBySlug ล้มเหลว:", error.message);
    return null;
  }

  return data ? toEvent(data as unknown as EventRow) : null;
}

/**
 * งานที่อยู่ใกล้พิกัดที่กำหนด เรียงจากใกล้ไปไกล
 *
 * ในโหมดจริงเรียกฟังก์ชัน events_nearby ที่ใช้ PostGIS คำนวณระยะทางบนผิวโลกจริง
 * และกรองด้วย GIST index จึงไม่ต้องสแกนทั้งตาราง (ดู supabase/migrations/0001_init.sql)
 */
export async function findNearbyEvents(options: {
  lat: number;
  lng: number;
  radiusM?: number;
  limit?: number;
  categorySlug?: string;
}): Promise<EventWithRelations[]> {
  const { lat, lng, radiusM = 100_000, limit = 20, categorySlug } = options;

  if (USING_SAMPLE_DATA) {
    const events = filterSampleEvents(await loadSampleEvents(), {
      categorySlug,
      upcomingOnly: true,
    });

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

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("events_nearby", {
    p_lat: lat,
    p_lng: lng,
    p_radius_m: radiusM,
    p_limit: limit,
    p_category: categorySlug ? (getCategory(categorySlug)?.id ?? null) : null,
  });

  if (error) {
    console.error("[events] findNearbyEvents ล้มเหลว:", error.message);
    return [];
  }

  return (data as EventRow[]).flatMap((row) => toEvent(row) ?? []);
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

export type { EventRecord };
export { CATEGORIES, PROVINCES };
