"use client";

import Link from "next/link";

import { formatDateRange, formatTimeRange } from "@/lib/format";
import type { MapPinEvent } from "@/lib/events";

/**
 * รายการงานของกลุ่มหมุดที่ซูมแล้วยังแยกไม่ออก
 *
 * ── ทำไมต้องมี ──
 * งานที่จัดในลานเดียวกันหรือห่างกันไม่กี่ร้อยเมตร ต่อให้ซูมจนสุดเพดานก็ยังทับกันอยู่
 * ถ้าปล่อยให้กดแล้วซูมอย่างเดียว ผู้ใช้จะกดซ้ำๆ แล้วไม่มีอะไรเกิดขึ้น
 * แผงนี้จึงเป็น "ทางออกสุดท้าย" ที่ทำให้เข้าถึงงานทุกรายการได้เสมอ
 *
 * เป็น HTML ไม่ใช่ SVG ด้วยเหตุผลเดียวกับ EventPinCard คือจัดข้อความง่ายกว่ามาก
 * ตำแหน่งจึงต้องแปลงจากพิกัดแผนที่กลับเป็นพิกเซลด้วย mapToScreen()
 */
export function ClusterPinCard({
  events,
  x,
  y,
  placement,
  onClose,
}: {
  events: MapPinEvent[];
  /** ตำแหน่งกึ่งกลางกลุ่มบนจอ หน่วยพิกเซล */
  x: number;
  y: number;
  /** วางแผงเหนือหรือใต้กลุ่ม — ผู้เรียกเลือกจากตำแหน่งกลุ่มในกรอบแผนที่ */
  placement: "above" | "below";
  onClose: () => void;
}) {
  const above = placement === "above";

  return (
    <div
      /*
        z-30 เพื่อลอยเหนือแผงจังหวัด (z-20) — บนมือถือแถบแผนที่เหลือสูงแค่ราว 256px
        ซึ่งใส่แผงรายการไม่พอ ถ้าใช้ z เท่ากันแผงนี้จะถูกแผงจังหวัดบังจนกดไม่ได้เลย
        การซ้อนทับแบบนี้เป็นธรรมเนียมของแอปแผนที่บนมือถืออยู่แล้ว และปิดได้ด้วยปุ่ม ✕
      */
      className="pointer-events-none absolute z-30 w-64"
      style={{
        left: x,
        top: y,
        // จัดกึ่งกลางแนวนอน แล้วยกขึ้นเหนือกลุ่มหรือหย่อนลงใต้กลุ่ม
        // เว้น 18px ให้พ้นวงกลม (มากกว่าการ์ดหมุดเดี่ยว เพราะวงกลุ่มรัศมีใหญ่กว่า)
        transform: above ? "translate(-50%, calc(-100% - 18px))" : "translate(-50%, 18px)",
      }}
    >
      {/* สามเหลี่ยมชี้ขึ้นหากลุ่ม — ใช้เฉพาะตอนแผงอยู่ใต้กลุ่ม */}
      {above ? null : (
        <div
          aria-hidden
          className="mx-auto size-3 translate-y-1.5 rotate-45 border-t border-l border-line bg-surface/95"
        />
      )}

      <div className="pointer-events-auto rounded-2xl border border-line bg-surface/95 shadow-lg backdrop-blur">
        <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
          <p className="text-sm font-semibold">
            {events.length.toLocaleString("th-TH")} งานบริเวณนี้
          </p>
          <button
            type="button"
            onClick={onClose}
            aria-label="ปิด"
            // size-11 = 44px ตามขนาดเป้าแตะขั้นต่ำ ส่วน -my-2 ดึงกลับไม่ให้หัวแผงสูงขึ้นตาม
            className="-my-2 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
          >
            ✕
          </button>
        </div>

        {/*
          จำกัดความสูงแล้วให้เลื่อนได้ เพราะกลุ่มหนึ่งอาจมีงานหลายสิบรายการ
          ถ้าปล่อยให้ยืดตามเนื้อหา แผงจะล้นออกนอกจอจนกดปุ่มปิดไม่ถึง
        */}
        <ul className="max-h-64 overflow-y-auto p-1.5">
          {events.map((event) => {
            const time = formatTimeRange(event.startAt, event.endAt, event.isAllDay);

            return (
              <li key={event.id}>
                <Link
                  href={`/events/${event.slug}`}
                  className="flex min-h-11 items-start gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-surface-muted"
                >
                  <span aria-hidden className="text-base leading-tight">
                    {event.categoryEmoji}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm leading-snug font-medium">{event.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">
                      {formatDateRange(event.startAt, event.endAt)}
                      {time ? ` · ${time}` : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* สามเหลี่ยมชี้ลงหากลุ่ม ทำให้เห็นชัดว่าแผงนี้เป็นของกลุ่มไหน */}
      {above ? (
        <div
          aria-hidden
          className="mx-auto size-3 -translate-y-1.5 rotate-45 border-r border-b border-line bg-surface/95"
        />
      ) : null}
    </div>
  );
}
