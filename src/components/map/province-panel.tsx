import Link from "next/link";

import { formatDateRange, formatPrice, formatRelativeDay, formatTimeRange } from "@/lib/format";
import type { EventWithRelations, Province } from "@/lib/types";

interface Props {
  province?: Province;
  events: EventWithRelations[];
  /** จำนวนงานทั้งหมดในจังหวัดนี้ (อาจมากกว่าที่แสดงในแผง) */
  totalCount: number;
  /** query string ของฟิลเตอร์ปัจจุบัน ใช้ทำลิงก์ปิดแผงให้กลับสู่สถานะเดิม */
  baseParams: string;
  /** query string สำหรับส่งต่อไปหน้าค้นหาละเอียด (พาช่วงวันที่ไปด้วย) */
  searchParams: string;
}

/**
 * แผงแสดงงานของจังหวัดที่เลือกบนแผนที่
 *
 * เป็น Server Component — ข้อมูลมาจากเซิร์ฟเวอร์ตาม ?province= ใน URL
 * ทำให้แชร์ลิงก์ที่เปิดแผงค้างไว้ได้ และปุ่มย้อนกลับของเบราว์เซอร์ทำงานถูกต้อง
 *
 * เดสก์ท็อป: คอลัมน์ข้างแผนที่ / มือถือ: แผ่นเลื่อนขึ้นจากด้านล่าง (bottom sheet)
 */
export function ProvincePanel({
  province,
  events,
  totalCount,
  baseParams,
  searchParams,
}: Props) {
  // ยังไม่เลือกจังหวัด — ไม่ต้องขึ้นแผงมาบังแผนที่ แค่บอกวิธีใช้เบาๆ มุมล่างซ้ายบนเดสก์ท็อป
  if (!province) {
    return (
      <p className="pointer-events-none absolute bottom-3 left-3 z-10 hidden rounded-xl border border-line bg-surface/90 px-4 py-3 text-sm text-muted backdrop-blur lg:block">
        กดที่จังหวัดเพื่อดูงาน · ลากเพื่อเลื่อนแผนที่
      </p>
    );
  }

  const closeHref = baseParams ? `/map?${baseParams}` : "/map";
  const searchHref = `/events?${searchParams}`;

  return (
    <aside
      // มือถือ: แผ่นเลื่อนขึ้นจากด้านล่าง / เดสก์ท็อป: แผงลอยชิดขวาของเวทีแผนที่
      className="absolute inset-x-0 bottom-0 z-20 max-h-[60%] overflow-y-auto rounded-t-2xl border-t border-line bg-surface/95 p-4 shadow-[0_-8px_32px_-12px_rgba(0,0,0,0.7)] backdrop-blur lg:inset-x-auto lg:top-3 lg:right-3 lg:bottom-3 lg:w-80 lg:max-h-none lg:rounded-2xl lg:border"
      aria-label={`งานในจังหวัด${province.nameTh}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">{province.nameTh}</h2>
          <p className="text-sm text-muted">
            {totalCount > 0 ? `${totalCount.toLocaleString("th-TH")} งานกำลังจะจัด` : "ยังไม่มีงานในช่วงนี้"}
          </p>
        </div>

        <Link
          href={closeHref}
          scroll={false}
          aria-label="ปิดแผง"
          className="flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          ✕
        </Link>
      </div>

      {events.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {events.map((event) => {
            const relative = formatRelativeDay(event.startAt, event.endAt);
            const time = formatTimeRange(event.startAt, event.endAt, event.isAllDay);

            return (
              <li key={event.id}>
                <Link
                  href={`/events/${event.slug}`}
                  className="block rounded-xl border border-line bg-surface-muted p-3 transition-colors hover:border-brand-400"
                >
                  <div className="flex items-start gap-2">
                    <span aria-hidden className="text-lg leading-none">
                      {event.category.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium leading-snug">{event.title}</p>
                      <p className="mt-1 text-sm text-muted">
                        {formatDateRange(event.startAt, event.endAt)}
                        {time ? ` · ${time}` : null}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        {event.venueName ?? province.nameTh} ·{" "}
                        {formatPrice(event.isFree, event.priceMin, event.priceMax)}
                      </p>
                    </div>
                    {relative ? (
                      <span className="shrink-0 rounded-full bg-brand-900/60 px-2 py-1 text-xs font-medium text-brand-200">
                        {relative}
                      </span>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-center text-sm text-muted">
          ลองขยายช่วงเวลาด้านบน หรือ{" "}
          <Link href="/submit" className="font-medium text-brand-400 hover:underline">
            แจ้งงานที่คุณรู้จัก
          </Link>
        </p>
      )}

      {totalCount > events.length ? (
        <p className="mt-3 text-center text-xs text-muted">
          แสดง {events.length} จาก {totalCount.toLocaleString("th-TH")} งาน
        </p>
      ) : null}

      <Link
        href={searchHref}
        className="mt-4 flex min-h-11 items-center justify-center rounded-xl border border-brand-500 px-4 text-sm font-medium text-brand-300 transition-colors hover:bg-brand-950/40"
      >
        ค้นหาแบบละเอียดใน{province.nameTh} →
      </Link>
    </aside>
  );
}
