import Link from "next/link";

import { EventCover } from "@/components/event-cover";
import {
  formatDateRange,
  formatDistance,
  formatPrice,
  formatRelativeDay,
  formatTimeRange,
} from "@/lib/format";
import type { EventWithRelations } from "@/lib/types";

export function EventCard({ event }: { event: EventWithRelations }) {
  const relative = formatRelativeDay(event.startAt, event.endAt);
  const time = formatTimeRange(event.startAt, event.endAt, event.isAllDay);

  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-shadow hover:shadow-[0_0_0_1px_var(--color-line),0_12px_32px_-12px_rgba(0,0,0,0.6)]">
      <EventCover category={event.category} imageUrl={event.coverImageUrl} />

      {relative ? (
        <span className="absolute top-3 right-3 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-medium text-white glow-brand">
          {relative}
        </span>
      ) : null}

      <div className="flex flex-1 flex-col p-4">
        <h3 className="font-semibold leading-snug">
          {/*
            ลิงก์ครอบทั้งการ์ดด้วย ::after แทนการห่อทั้งก้อนด้วย <a>
            ทำให้ screen reader อ่านแค่ชื่องานเป็นลิงก์ ไม่ต้องอ่านทุกอย่างในการ์ด
          */}
          <Link
            href={`/events/${event.slug}`}
            className="after:absolute after:inset-0 after:content-[''] hover:text-brand-400"
          >
            {event.title}
          </Link>
        </h3>

        <p className="mt-1 text-sm text-muted">
          {event.venueName ?? event.province.nameTh}
          {event.venueName ? ` · ${event.province.nameTh}` : null}
        </p>

        <dl className="mt-3 space-y-1 text-sm">
          <div className="flex gap-2">
            <dt className="sr-only">วันที่</dt>
            <dd>
              <span aria-hidden className="mr-1.5">
                📅
              </span>
              {formatDateRange(event.startAt, event.endAt)}
              {time ? <span className="text-muted"> · {time}</span> : null}
            </dd>
          </div>

          {event.distanceM !== undefined ? (
            <div>
              <dt className="sr-only">ระยะทาง</dt>
              <dd className="text-muted">
                <span aria-hidden className="mr-1.5">
                  📍
                </span>
                ห่างจากคุณ {formatDistance(event.distanceM)}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="mt-3 flex flex-wrap items-center gap-2 pt-1 text-xs">
          <span
            className="rounded-full px-2.5 py-1 font-medium"
            style={{
              backgroundColor: `color-mix(in srgb, ${event.category.accentColor} 22%, transparent)`,
              color: `color-mix(in srgb, ${event.category.accentColor} 65%, white)`,
            }}
          >
            {event.category.nameTh}
          </span>

          <span
            className={
              event.isFree
                ? "rounded-full bg-emerald-500/20 px-2.5 py-1 font-medium text-emerald-300"
                : "rounded-full bg-surface-muted px-2.5 py-1 text-muted"
            }
          >
            {formatPrice(event.isFree, event.priceMin, event.priceMax)}
          </span>
        </div>
      </div>
    </article>
  );
}
