"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { DATE_RANGE_LABELS, type DateRangeKey } from "@/lib/date-range";

const RANGES = Object.keys(DATE_RANGE_LABELS) as DateRangeKey[];

interface Props {
  range: DateRangeKey;
  /** slug จังหวัดที่เลือกอยู่ ต้องพาไปด้วยเวลาเปลี่ยนช่วงเวลา */
  province?: string;
}

/**
 * แถบฟิลเตอร์ของหน้าแผนที่ — มีแค่ช่วงเวลาแบบเร็ว
 *
 * ตั้งใจให้เหลือน้อยที่สุด เพราะแผนที่คือโหมด "สำรวจ" การเลือกพื้นที่ทำได้ด้วย
 * การซูมและลากบนแผนที่โดยตรงอยู่แล้ว ถ้าต้องการเจาะจงวันเวลาหรือหมวดหมู่
 * ให้ไปใช้ตัวกรองเต็มรูปแบบที่หน้า /events แทน
 *
 * ใช้ soft navigation แบบเดียวกับ src/components/event-filters.tsx
 * คือเปลี่ยน URL แต่ไม่โหลดหน้าใหม่ทั้งหน้า
 */
export function MapControls({ range, province }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function apply(nextRange: DateRangeKey) {
    const params = new URLSearchParams();

    if (nextRange !== "all") params.set("range", nextRange);
    // การเปลี่ยนช่วงเวลาไม่กระทบว่าจังหวัดไหนถูกเลือก จึงเก็บไว้
    if (province) params.set("province", province);

    const query = params.toString();
    startTransition(() => router.push(query ? `/map?${query}` : "/map", { scroll: false }));
  }

  return (
    <div
      aria-busy={isPending}
      className="pointer-events-auto flex items-center gap-2 rounded-2xl border border-line bg-surface/90 p-2 backdrop-blur"
    >
      <span className="shrink-0 pl-1 text-xs font-medium text-muted">ช่วงเวลา</span>
      <div className="flex gap-1.5">
        {RANGES.map((value) => (
          <Chip key={value} active={range === value} onClick={() => apply(value)}>
            {DATE_RANGE_LABELS[value]}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 shrink-0 rounded-full border px-3 text-sm whitespace-nowrap transition-colors ${
        active
          ? "border-brand-500 bg-brand-600 font-medium text-white"
          : "border-line bg-surface hover:border-brand-400"
      }`}
    >
      {children}
    </button>
  );
}
