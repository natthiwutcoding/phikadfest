"use client";

import { ACTIVE_REGION_LABEL } from "@/lib/region-scope";

/**
 * ปุ่มควบคุมมุมขวาของแผนที่ ตามธรรมเนียมแอปแผนที่ทั่วไป
 *
 * แยกไฟล์จาก `thailand-map.tsx` เพราะเป็น UI ล้วน ไม่แตะ state ของกล้องเลย —
 * รับแค่ callback สี่ตัว การอ่านโค้ดแผนที่จึงไม่ต้องเลื่อนผ่านมาร์กอัปของปุ่ม
 *
 * ⚠️ อย่าสับสนกับ `map-controls.tsx` ที่อยู่ข้างกัน — ไฟล์นั้นคือแถบกรองช่วงเวลา
 * มุมบนซ้ายที่เปลี่ยน URL ส่วนไฟล์นี้คือปุ่มซูมและหาตำแหน่งที่ทำงานฝั่งเบราว์เซอร์ล้วน
 */
export function MapZoomControls({
  onZoomIn,
  onZoomOut,
  onWholeRegion,
  onLocate,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onWholeRegion: () => void;
  onLocate: () => void;
}) {
  const round =
    "flex size-11 items-center justify-center rounded-xl border border-line bg-surface/90 backdrop-blur transition-colors hover:bg-surface-muted";

  return (
    <div className="absolute right-3 bottom-8 z-10 flex flex-col gap-2 lg:top-1/2 lg:bottom-auto lg:-translate-y-1/2">
      <button type="button" onClick={onLocate} aria-label="ไปที่ตำแหน่งของฉัน" className={round}>
        <span aria-hidden className="text-lg">
          📍
        </span>
      </button>

      <div className="flex flex-col overflow-hidden rounded-xl border border-line backdrop-blur">
        <button
          type="button"
          onClick={onZoomIn}
          aria-label="ซูมเข้า"
          className="flex size-11 items-center justify-center bg-surface/90 text-xl transition-colors hover:bg-surface-muted"
        >
          <span aria-hidden>+</span>
        </button>
        <div className="h-px bg-line" />
        <button
          type="button"
          onClick={onZoomOut}
          aria-label="ซูมออก"
          className="flex size-11 items-center justify-center bg-surface/90 text-xl transition-colors hover:bg-surface-muted"
        >
          <span aria-hidden>−</span>
        </button>
      </div>

      {/*
        มุมมอง "ถอยสุด" ของเว็บนี้คือทั้งภาค ไม่ใช่ทั้งประเทศ จึงใช้ไอคอนเข็มทิศแทนธงชาติ
        ธงชาติสื่อว่ากดแล้วจะเห็นทั้งไทย ซึ่งไม่ตรงกับสิ่งที่เกิดขึ้นจริง
      */}
      <button
        type="button"
        onClick={onWholeRegion}
        aria-label={`ดูทั้ง${ACTIVE_REGION_LABEL}`}
        className={round}
      >
        <span aria-hidden>🧭</span>
      </button>
    </div>
  );
}
