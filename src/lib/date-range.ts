import { bangkokDay } from "@/lib/format";

/**
 * ช่วงเวลาแบบเร็วสำหรับหน้าแผนที่
 *
 * ใช้เป็น "หน้าต่างเลื่อน" นับจากวันนี้ ไม่ใช่สัปดาห์/เดือนตามปฏิทิน
 * เพราะคนที่เปิดดูวันพฤหัสฯ ต้องการรู้ว่าเสาร์-อาทิตย์นี้มีอะไร ไม่ใช่ว่าสัปดาห์ปฏิทินเหลืออีกกี่วัน
 * ป้ายจึงเขียนว่า "ใน 7 วัน" ไม่ใช่ "สัปดาห์นี้" เพื่อไม่ให้เข้าใจผิด
 *
 * ถ้าต้องการเจาะจงวันเวลาละเอียดกว่านี้ ให้ไปใช้ตัวกรองในหน้า /events แทน
 */
export type DateRangeKey = "week" | "month" | "all";

export const DATE_RANGE_LABELS: Record<DateRangeKey, string> = {
  week: "ใน 7 วัน",
  month: "ใน 1 เดือน",
  all: "ทั้งหมด",
};

const DEFAULT_DATE_RANGE: DateRangeKey = "all";

const DAY_MS = 86_400_000;

/** แปลงค่าจาก URL ให้เป็น DateRangeKey ที่เชื่อถือได้ — ค่าที่ไม่รู้จักจะกลายเป็นค่าตั้งต้น */
export function parseDateRange(value: string | undefined): DateRangeKey {
  return value === "week" || value === "month" || value === "all" ? value : DEFAULT_DATE_RANGE;
}

/**
 * แปลงเป็นช่วงวันที่ในรูปแบบ 'YYYY-MM-DD' ที่ listEvents() รับได้
 *
 * ใช้ bangkokDay() คำนวณ เพื่อให้ "วันนี้" หมายถึงวันนี้ตามเวลาไทย
 * ไม่ใช่ตามเวลา UTC ของเซิร์ฟเวอร์ ซึ่งจะคลาดไปหนึ่งวันในช่วงหัวค่ำ
 */
export function resolveDateRange(range: DateRangeKey): { from?: string; to?: string } {
  if (range === "all") return {};

  const days = range === "week" ? 7 : 30;
  return {
    from: bangkokDay(new Date()),
    to: bangkokDay(new Date(Date.now() + days * DAY_MS)),
  };
}
