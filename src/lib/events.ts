import { cache } from "react";

import {
  filterKey,
  normalizeFilters,
  parseFilterKey,
  type NormalizedEventFilters,
} from "@/lib/event-filter-key";
import { getCategory, getCategoryById } from "@/lib/data/categories";
import { getProvince, getProvinceById, PROVINCES } from "@/lib/data/provinces";
import { getSampleEvents } from "@/lib/data/sample-events";
import { haversineMeters } from "@/lib/geo";
import { ACTIVE_PROVINCE_IDS, isProvinceInScope } from "@/lib/region-scope";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type {
  EventFilters,
  EventWithRelations,
  MapPinEvent,
  ProvinceEventSummary,
} from "@/lib/types";

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
  const province = getProvinceById(row.province_id);
  const category = getCategoryById(row.category_id);
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

/** นับจำนวนรายการต่อคีย์ — ใช้ร่วมกันทั้งการนับตามหมวดหมู่และตามจังหวัด */
function countBy<T>(items: T[], keyOf: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>();

  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  return counts;
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
  filters: NormalizedEventFilters,
): EventWithRelations[] {
  const { upcomingOnly } = filters;

  // บังคับขอบเขตภาคเหมือนที่ทำกับ query จริง ไม่งั้นโหมดพัฒนาจะให้ผลต่างจากตอน deploy
  let results = events.filter((event) => isProvinceInScope(event.provinceSlug));

  if (upcomingOnly) {
    const now = Date.now();
    // ใช้ endAt ไม่ใช่ startAt — งานหลายวันที่เริ่มไปแล้วแต่ยังไม่จบ ยังไปทันอยู่
    results = results.filter((event) => Date.parse(event.endAt) >= now);
  }

  if (filters.provinceSlug) {
    results = results.filter((event) => event.provinceSlug === filters.provinceSlug);
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
      [event.title, event.description, event.venueName, event.province.nameTh].some((field) =>
        field?.toLowerCase().includes(needle),
      ),
    );
  }

  // results เป็น array ใหม่จาก .filter() อยู่แล้ว จึงเรียงในที่ได้โดยไม่กระทบข้อมูลต้นทาง
  return results.sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));
}

// ---------------------------------------------------------------------------
// API ที่หน้าเว็บเรียกใช้
// ---------------------------------------------------------------------------

/** ยิง query จริง — ห้ามเรียกตรงจากภายนอก ให้ผ่าน listEvents() ที่กัน query ซ้ำให้แล้ว */
async function queryEvents(filters: NormalizedEventFilters): Promise<EventWithRelations[]> {
  const { upcomingOnly, limit } = filters;

  if (USING_SAMPLE_DATA) {
    const results = filterSampleEvents(await loadSampleEvents(), filters);
    return limit ? results.slice(0, limit) : results;
  }

  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("status", "approved")
    /*
      บังคับขอบเขตภาคทุก query เสมอ — ไม่ใช่ตัวเลือกที่ผู้เรียกจะข้ามได้

      ฟังก์ชันอื่นทั้งหมด (listMapPinEvents, getProvinceEventSummary) เรียกผ่าน
      listEvents ตัวนี้ การกรองที่นี่จุดเดียวจึงคุมหน้าแรก หน้าค้นหา หน้าแผนที่
      และ sitemap พร้อมกัน
    */
    .in("province_id", ACTIVE_PROVINCE_IDS);

  if (upcomingOnly) {
    query = query.gte("end_at", new Date().toISOString());
  }

  // แปลง slug เป็น id ก่อนกรอง เพราะตาราง events เก็บเป็น foreign key ไม่ใช่ slug
  if (filters.provinceSlug) {
    const province = getProvince(filters.provinceSlug);
    // จังหวัดนอกภาคที่เปิดรับ — คืนว่างทันที กันคนแก้ URL เองให้ชี้ไปจังหวัดที่เราไม่ได้เปิดรับ
    if (!province || !isProvinceInScope(province.slug)) return [];
    query = query.eq("province_id", province.id);
  }

  if (filters.categorySlug) {
    const category = getCategory(filters.categorySlug);
    if (!category) return [];
    query = query.eq("category_id", category.id);
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

  const { data, error } = await query.returns<EventRow[]>();
  if (error) {
    console.error("[events] listEvents ล้มเหลว:", error.message);
    return [];
  }

  return (data ?? []).flatMap((row) => toEvent(row) ?? []);
}

/**
 * รวม query ที่เหมือนกันภายใน request เดียวให้ยิงจริงครั้งเดียว
 *
 * จำเป็นเพราะหน้าหนึ่งเรียกข้อมูลชุดเดียวกันหลายทาง เช่นหน้าแผนที่ที่ต้องใช้ทั้ง
 * สรุปรายจังหวัดและหมุดงาน ซึ่งมาจากรายการงานชุดเดียวกัน
 *
 * Next.js รวม `fetch()` ที่ซ้ำกันให้อัตโนมัติ แต่ไม่รวม query ที่ยิงผ่าน Supabase client
 * จึงต้องห่อเอง (แนวทางเดียวกับที่ `lib/auth.ts` ใช้กับ getCurrentUser)
 * ขอบเขตของแคชคือหนึ่ง request เท่านั้น ไม่มีการแชร์ข้ามผู้ใช้หรือข้ามการโหลดหน้า
 *
 * ตัวกรองเดินทางเข้ามาเป็นคีย์ข้อความ เพราะ React.cache เทียบ argument ด้วย reference
 * (ดูเหตุผลเต็มใน `lib/event-filter-key.ts`)
 */
const cachedListEvents = cache(
  (key: string): Promise<EventWithRelations[]> => queryEvents(parseFilterKey(key)),
);

/** ค้นหาอีเวนต์ตามเงื่อนไข เรียงตามวันที่เริ่มจากใกล้ที่สุด */
export function listEvents(filters: EventFilters = {}): Promise<EventWithRelations[]> {
  return cachedListEvents(filterKey(filters));
}

/**
 * งานหนึ่งรายการจาก slug — คืน null เมื่อไม่พบ
 *
 * ห่อด้วย cache เพราะหน้ารายละเอียดงานเรียกสองครั้งต่อการโหลดหนึ่งครั้ง:
 * ครั้งแรกใน generateMetadata (ทำ <title> กับ OG) และอีกครั้งในตัวหน้าเอง
 */
export const getEventBySlug = cache(async (slug: string): Promise<EventWithRelations | null> => {
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
    .returns<EventRow[]>()
    .maybeSingle();

  if (error) {
    console.error("[events] getEventBySlug ล้มเหลว:", error.message);
    return null;
  }

  return data ? toEvent(data) : null;
});

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
    const events = filterSampleEvents(
      await loadSampleEvents(),
      normalizeFilters({ categorySlug, upcomingOnly: true }),
    );

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
      .sort((a, b) => a.distanceM - b.distanceM)
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

  /*
    ฟังก์ชันนี้เรียก RPC ตรงๆ จึงไม่ได้ตัวกรองภาคที่บังคับไว้ใน listEvents ต้องกรองเองที่นี่

    กรองฝั่ง JS แทนการแก้ SQL เพราะไม่ต้องเพิ่ม migration และแถวที่ RPC คืนมาถูกจำกัดด้วย
    limit อยู่แล้ว (ตั้งต้น 20) การกรองซ้ำจึงไม่มีผลต่อประสิทธิภาพ
  */
  return ((data ?? []) as EventRow[]).flatMap((row) => {
    const event = toEvent(row);
    return event && isProvinceInScope(event.provinceSlug) ? [event] : [];
  });
}

/**
 * จำนวนงานแยกตามหมวดหมู่ — ใช้แสดงตัวเลขบนปุ่มกรองหน้าแรก
 *
 * รับรายการงานที่ดึงมาแล้วแทนการดึงเอง เพราะหน้าที่ใช้ตัวเลขนี้แสดงการ์ดงาน
 * จากชุดข้อมูลเดียวกันอยู่แล้ว — ส่งต่อกันได้เลย ไม่ต้องยิง query เพิ่ม
 */
export function countByCategory(events: EventWithRelations[]): Map<string, number> {
  return countBy(events, (event) => event.categorySlug);
}

/**
 * จังหวัดที่มีงาน พร้อมจำนวน เรียงจากมากไปน้อย — ใช้ทำหน้าแรกและ sitemap
 *
 * รับรายการงานที่ดึงมาแล้วด้วยเหตุผลเดียวกับ countByCategory
 */
export function provincesWithEvents(
  events: EventWithRelations[],
): { slug: string; nameTh: string; count: number }[] {
  const counts = countBy(events, (event) => event.provinceSlug);

  return PROVINCES.flatMap((province) => {
    const count = counts.get(province.slug);
    return count ? [{ slug: province.slug, nameTh: province.nameTh, count }] : [];
  }).sort((a, b) => b.count - a.count);
}

/**
 * งานที่มีพิกัดจริง สำหรับปักหมุดบนแผนที่
 *
 * คัดเฉพาะที่มี lat/lng ครบ — งานที่รู้แค่จังหวัดจะไม่ถูกปักหมุด
 * เพราะการเดาพิกัดจากจุดกึ่งกลางจังหวัดคือการอ้างความแม่นยำที่เราไม่มี
 * (งานเหล่านั้นยังนับรวมในสีความหนาแน่นของจังหวัดตามปกติ)
 */
export async function listMapPinEvents(
  filters: Pick<EventFilters, "from" | "to"> = {},
): Promise<MapPinEvent[]> {
  const events = await listEvents(filters);

  return events.flatMap((event) => {
    if (event.lat == null || event.lng == null) return [];

    return [
      {
        id: event.id,
        slug: event.slug,
        title: event.title,
        startAt: event.startAt,
        endAt: event.endAt,
        isAllDay: event.isAllDay,
        venueName: event.venueName,
        isFree: event.isFree,
        priceMin: event.priceMin,
        priceMax: event.priceMax,
        lat: event.lat,
        lng: event.lng,
        categoryNameTh: event.category.nameTh,
        categoryEmoji: event.category.emoji,
        categoryColor: event.category.accentColor,
      },
    ];
  });
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

  return PROVINCES.flatMap((province) => {
    const summary = byProvince.get(province.slug);
    if (!summary) return [];

    return [
      {
        code: province.code,
        slug: province.slug,
        nameTh: province.nameTh,
        count: summary.count,
        nextEventAt: summary.nextEventAt,
      },
    ];
  });
}
