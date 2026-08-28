import type { Metadata } from "next";
import Link from "next/link";

import { EventCard } from "@/components/event-card";
import { EventFilters, type FilterValues } from "@/components/event-filters";
import { getCategory } from "@/lib/data/categories";
import { getProvince } from "@/lib/data/provinces";
import { listEvents } from "@/lib/events";

/** searchParams ให้ค่ามาเป็น string | string[] เสมอ — หน้านี้สนใจแค่ค่าเดียว */
function one(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single?.trim() || undefined;
}

function readFilters(params: Record<string, string | string[] | undefined>): FilterValues {
  return {
    province: one(params.province),
    category: one(params.category),
    from: one(params.from),
    to: one(params.to),
    q: one(params.q),
  };
}

/**
 * ประกอบหัวข้อหน้าจากตัวกรอง เช่น "งานดนตรี ในเชียงใหม่"
 * ใช้ทั้งเป็น <h1> และ <title> เพื่อให้หน้าที่กรองแล้วมีคุณค่าต่อ SEO
 * (คนค้นหา "งานดนตรีเชียงใหม่" ใน Google ควรเจอหน้านี้)
 */
function buildHeading(filters: FilterValues): string {
  const category = filters.category ? getCategory(filters.category) : undefined;
  const province = filters.province ? getProvince(filters.province) : undefined;

  const subject = category ? `งาน${category.nameTh.split(" / ")[0]}` : "งานทั้งหมด";
  const place = province ? ` ใน${province.nameTh}` : " ทั่วประเทศ";

  return `${subject}${place}`;
}

export async function generateMetadata(props: PageProps<"/events">): Promise<Metadata> {
  const filters = readFilters(await props.searchParams);
  const heading = buildHeading(filters);

  return {
    title: heading,
    description: `รวม${heading} พร้อมวันเวลา สถานที่ และรายละเอียดการเข้าร่วม`,
    alternates: { canonical: "/events" },
  };
}

export default async function EventsPage(props: PageProps<"/events">) {
  const filters = readFilters(await props.searchParams);

  const events = await listEvents({
    provinceSlug: filters.province,
    categorySlug: filters.category,
    from: filters.from,
    to: filters.to,
    query: filters.q,
  });

  const heading = buildHeading(filters);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{heading}</h1>
          <p className="mt-1 text-sm text-muted">
            พบ {events.length.toLocaleString("th-TH")} งานที่กำลังจะจัด
          </p>
        </div>

        {/* ขากลับไปโหมดสำรวจ — พาจังหวัดที่กรองไว้ไปด้วยเพื่อไม่ให้ผู้ใช้ต้องเลือกซ้ำ */}
        <Link
          href={filters.province ? `/map?province=${filters.province}` : "/map"}
          className="flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-line bg-surface px-4 text-sm font-medium transition-colors hover:border-brand-400"
        >
          <span aria-hidden>🗺️</span> ดูบนแผนที่
        </Link>
      </div>

      <div className="mt-5">
        <EventFilters values={filters} />
      </div>

      {events.length > 0 ? (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {events.map((event) => (
            <li key={event.id}>
              <EventCard event={event} />
            </li>
          ))}
        </ul>
      ) : (
        <div className="mt-6 rounded-2xl border border-dashed border-line bg-surface p-10 text-center">
          <p className="font-medium">ไม่พบงานที่ตรงกับเงื่อนไข</p>
          <p className="mt-1 text-sm text-muted">
            ลองขยายช่วงวันที่ เลือกจังหวัดอื่น หรือล้างตัวกรองดู
          </p>
        </div>
      )}
    </div>
  );
}
