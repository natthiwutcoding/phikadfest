import type { Category } from "@/lib/types";

/**
 * ภาพประกอบด้านบนการ์ดงาน — สร้างด้วย SVG ล้วน ไม่พึ่งพาภาพถ่ายจากภายนอก
 *
 * เหตุผลที่เลือกทางนี้แทนภาพถ่ายสต็อกจากเน็ต (เช่น Unsplash):
 *  1. ไม่มีทางลิงก์เสีย หรือได้ภาพที่ไม่ตรงกับหมวดหมู่งาน
 *  2. ควบคุมโทนสีให้เข้ากับธีม Dark ได้เป๊ะ (ไล่สีตาม accentColor ของแต่ละหมวดหมู่)
 *  3. ไม่ต้องตั้งค่า remote image domain หรือโหลดภาพจากเซิร์ฟเวอร์อื่น
 *
 * เมื่อมี event.coverImageUrl จริง (หลังต่อ Supabase Storage แล้ว) ให้ใช้ <Image> แสดงแทนที่นี่
 */
export function EventCover({ category }: { category: Category }) {
  const gradientId = `cover-${category.slug}`;

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
