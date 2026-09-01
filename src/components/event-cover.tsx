import Image from "next/image";

import type { Category } from "@/lib/types";

/**
 * ภาพประกอบด้านบนการ์ดงาน
 *
 * มีรูปจริงที่ผู้แจ้งงานอัปโหลดมา → แสดงรูปนั้น
 * ไม่มี → วาดภาพประกอบไล่สีด้วย SVG ตามสี accent ของหมวดหมู่
 *
 * เหตุผลที่ยังเก็บ SVG ไว้เป็นตัวสำรอง แทนการปล่อยว่างหรือใช้ภาพสต็อกจากเน็ต:
 *  1. งานส่วนใหญ่ช่วงแรกจะยังไม่มีรูป การ์ดต้องดูดีตั้งแต่วันแรกโดยไม่ต้องรอรูป
 *  2. ควบคุมโทนสีให้เข้ากับธีม Dark ได้เป๊ะ ไม่มีทางได้ภาพที่ไม่ตรงหมวดหมู่
 *  3. ไม่มีลิงก์เสีย เพราะไม่ได้พึ่งเซิร์ฟเวอร์ของใคร
 */
export function EventCover({
  category,
  imageUrl,
  /** true เมื่อเป็นรูปหลักที่เห็นตั้งแต่เปิดหน้า (หน้ารายละเอียดงาน) — ช่วยให้ LCP เร็วขึ้น */
  priority = false,
}: {
  category: Category;
  imageUrl?: string;
  priority?: boolean;
}) {
  const gradientId = `cover-${category.slug}`;

  if (imageUrl) {
    return (
      <div className="relative aspect-[16/9] w-full overflow-hidden rounded-t-2xl bg-surface-muted">
        <Image
          src={imageUrl}
          alt=""
          fill
          // การ์ดกว้างสุด ~1 ใน 3 ของ container 1152px บนจอใหญ่ เต็มความกว้างบนมือถือ
          sizes="(min-width: 1024px) 384px, 100vw"
          priority={priority}
          className="object-cover"
        />
      </div>
    );
  }

  return (
    <div
      className="relative aspect-[16/9] w-full overflow-hidden rounded-t-2xl"
      style={{ backgroundColor: "var(--color-surface-raised)" }}
    >
      <svg
        viewBox="0 0 400 225"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden
      >
        <defs>
          <radialGradient id={gradientId} cx="50%" cy="35%" r="75%">
            <stop offset="0%" stopColor={category.accentColor} stopOpacity="0.55" />
            <stop offset="55%" stopColor={category.accentColor} stopOpacity="0.18" />
            <stop offset="100%" stopColor={category.accentColor} stopOpacity="0" />
          </radialGradient>
        </defs>

        <rect width="400" height="225" fill="var(--color-surface-raised)" />
        <rect width="400" height="225" fill={`url(#${gradientId})`} />

        {/* จุดแสงกระจาย ให้ความรู้สึกโบเก้/ไฟประดับงานกลางคืน */}
        {BOKEH_DOTS.map(([cx, cy, r, opacity], index) => (
          <circle
            key={index}
            cx={cx}
            cy={cy}
            r={r}
            fill={category.accentColor}
            opacity={opacity}
          />
        ))}
      </svg>

      <span
        aria-hidden
        className="absolute inset-0 flex items-center justify-center text-5xl drop-shadow-lg"
      >
        {category.emoji}
      </span>
    </div>
  );
}

/** ตำแหน่ง [cx, cy, รัศมี, ความโปร่งใส] ของจุดแสง — สุ่มมือครั้งเดียวให้ดูเป็นธรรมชาติ ไม่ใช้ Math.random() เพราะต้องได้ผลเดียวกันทุกครั้งที่ render ฝั่งเซิร์ฟเวอร์ */
const BOKEH_DOTS: [number, number, number, number][] = [
  [60, 40, 14, 0.5],
  [340, 55, 20, 0.35],
  [300, 170, 10, 0.45],
  [40, 180, 16, 0.3],
  [200, 20, 8, 0.4],
  [370, 130, 6, 0.5],
];
