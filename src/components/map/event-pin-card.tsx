"use client";

import Link from "next/link";

import { formatDateRange, formatPrice, formatRelativeDay, formatTimeRange } from "@/lib/format";
import type { MapPinEvent } from "@/lib/types";

/**
 * การ์ดงานเล็กที่ลอยเหนือหมุดบนแผนที่
 *
 * เป็น HTML ไม่ใช่ SVG เพราะจัดข้อความและใช้คลาส Tailwind ได้ตรงไปตรงมากว่า
 * ตำแหน่งจึงต้องคำนวณจากพิกัดแผนที่กลับเป็นพิกเซลบนจอด้วย mapToScreen()
 *
 * กดที่การ์ด (หรือกดหมุดซ้ำ) = ไปหน้ารายละเอียดงาน
 */
export function EventPinCard({
  event,
  x,
  y,
  placement,
  onClose,
}: {
  event: MapPinEvent;
  /** ตำแหน่งหมุดบนจอ หน่วยพิกเซล */
  x: number;
  y: number;
  /** วางการ์ดเหนือหรือใต้หมุด — ผู้เรียกเลือกจากตำแหน่งหมุดในกรอบแผนที่ */
  placement: "above" | "below";
  onClose: () => void;
}) {
  const time = formatTimeRange(event.startAt, event.endAt, event.isAllDay);
  const relative = formatRelativeDay(event.startAt, event.endAt);
  const above = placement === "above";

  return (
    <div
      // z-30 เพื่อลอยเหนือแผงจังหวัด (z-20) ไม่งั้นบนมือถือการ์ดจะถูกแผงบังจนกดไม่ได้
      className="pointer-events-none absolute z-30 w-60"
      style={{
        left: x,
        top: y,
        // จัดกึ่งกลางตามแนวนอน แล้วยกขึ้นเหนือหมุดหรือหย่อนลงใต้หมุด เว้น 14px ให้พ้นตัวหมุด
        transform: above ? "translate(-50%, calc(-100% - 14px))" : "translate(-50%, 14px)",
      }}
    >
      {/* สามเหลี่ยมชี้ขึ้นหาหมุด — ใช้เฉพาะตอนการ์ดอยู่ใต้หมุด */}
      {above ? null : (
        <div
          aria-hidden
          className="mx-auto size-3 translate-y-1.5 rotate-45 border-t border-l border-line bg-surface/95"
        />
      )}

      <div className="pointer-events-auto rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur">
        <div className="flex items-start justify-between gap-2">
          <span className="text-lg leading-none" aria-hidden>
            {event.categoryEmoji}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            // size-11 = 44px ตามขนาดเป้าแตะขั้นต่ำ ส่วน -m-2 ดึงกลับไม่ให้การ์ดโตขึ้นตาม
            className="-mt-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        <Link href={`/events/${event.slug}`} className="mt-1 block">
          <p className="font-semibold leading-snug hover:text-brand-400">{event.title}</p>
        </Link>

        <p className="mt-1.5 text-xs text-muted">
          {formatDateRange(event.startAt, event.endAt)}
          {time ? ` · ${time}` : null}
        </p>

        {event.venueName ? (
          <p className="mt-0.5 text-xs text-muted">{event.venueName}</p>
        ) : null}

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          {relative ? (
            <span className="rounded-full bg-brand-900/60 px-2 py-0.5 font-medium text-brand-200">
              {relative}
            </span>
          ) : null}
          <span
            className={
              event.isFree
                ? "rounded-full bg-emerald-500/20 px-2 py-0.5 font-medium text-emerald-300"
                : "rounded-full bg-surface-muted px-2 py-0.5 text-muted"
            }
          >
            {formatPrice(event.isFree, event.priceMin, event.priceMax)}
          </span>
        </div>
      </div>

      {/* สามเหลี่ยมชี้ลงหาหมุด ทำให้เห็นชัดว่าการ์ดนี้เป็นของหมุดไหน */}
      {above ? (
        <div
          aria-hidden
          className="mx-auto size-3 -translate-y-1.5 rotate-45 border-r border-b border-line bg-surface/95"
        />
      ) : null}
    </div>
  );
}
