import { USING_SAMPLE_DATA } from "@/lib/events";

/**
 * แถบเตือนว่ากำลังแสดงข้อมูลตัวอย่าง ไม่ใช่งานจริง
 *
 * ตั้งใจให้เห็นชัดและอยู่บนสุดของทุกหน้า เพราะเว็บรวมอีเวนต์ที่แสดงงานปลอม
 * โดยผู้ใช้ไม่รู้ตัวคือปัญหาที่ร้ายแรงกว่าหน้าตาไม่สวย
 *
 * จะหายไปเองเมื่อตั้งค่า NEXT_PUBLIC_SUPABASE_URL แล้ว
 */
export function SampleDataBanner() {
  if (!USING_SAMPLE_DATA) return null;

  return (
    <div className="border-b border-amber-900 bg-amber-950/60 text-amber-100">
      <p className="mx-auto max-w-6xl px-4 py-2 text-center text-xs sm:text-sm">
        <span aria-hidden>⚠️</span> โหมดพัฒนา — งานทั้งหมดที่แสดงเป็น
        <strong className="font-semibold">ข้อมูลตัวอย่างที่แต่งขึ้น</strong> ไม่ใช่งานจริง
      </p>
    </div>
  );
}
