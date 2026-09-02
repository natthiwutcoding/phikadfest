/**
 * ฟังก์ชันจัดรูปแบบวันเวลา/ราคา สำหรับผู้ใช้ไทย
 *
 * สำคัญ: ทุกฟังก์ชันบังคับ timeZone เป็น 'Asia/Bangkok' เสมอ
 *
 * เหตุผล — เซิร์ฟเวอร์ (Vercel) รันด้วย timezone UTC แต่เบราว์เซอร์ผู้ใช้เป็น +07:00
 * ถ้าปล่อยให้ Intl ใช้ timezone ของเครื่อง วันที่ที่ render ฝั่งเซิร์ฟเวอร์กับฝั่ง client
 * จะไม่ตรงกัน ทำให้ React hydration error และผู้ใช้เห็นวันเพี้ยนไปหนึ่งวัน
 * โปรเจกต์นี้ให้บริการเฉพาะในไทย จึงตรึง timezone ไว้ได้เลย
 */

const TZ = "Asia/Bangkok";

/** th-TH ใช้ปฏิทินพุทธเป็นค่าตั้งต้น ปีจึงออกมาเป็น พ.ศ. โดยอัตโนมัติ */
const fullDateFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dayFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: TZ,
  day: "numeric",
});

const dayMonthFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
});

const dayMonthYearFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
});

const timeFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: TZ,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** en-CA ให้รูปแบบ 'YYYY-MM-DD' ซึ่งเทียบกันด้วย string ได้ตรงๆ */
const isoDayFmt = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** คืนวันที่ในเขตเวลาไทยเป็น 'YYYY-MM-DD' */
export function bangkokDay(date: Date | string): string {
  return isoDayFmt.format(typeof date === "string" ? new Date(date) : date);
}

function daysBetween(fromDay: string, toDay: string): number {
  const from = Date.parse(`${fromDay}T00:00:00Z`);
  const to = Date.parse(`${toDay}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/**
 * ช่วงวันของงาน เช่น
 *   วันเดียว   → 'ส. 22 ส.ค. 2569'
 *   ข้ามวัน    → '22 – 24 ส.ค. 2569'
 *   ข้ามเดือน  → '30 ส.ค. – 2 ก.ย. 2569'
 */
export function formatDateRange(startAt: string, endAt: string): string {
  const start = new Date(startAt);
  const end = new Date(endAt);

  const startDay = bangkokDay(start);
  const endDay = bangkokDay(end);

  if (startDay === endDay) {
    return fullDateFmt.format(start);
  }

  // อยู่เดือนเดียวกัน จึงไม่ต้องเขียนเดือนซ้ำสองครั้ง — '22 – 24 ส.ค. 2569'
  const sameMonth = startDay.slice(0, 7) === endDay.slice(0, 7);
  const startText = sameMonth ? dayFmt.format(start) : dayMonthFmt.format(start);

  return `${startText} – ${dayMonthYearFmt.format(end)}`;
}

/** ช่วงเวลา เช่น '18:00 – 23:00 น.' — คืน null ถ้างานไม่ระบุเวลา */
export function formatTimeRange(startAt: string, endAt: string, isAllDay: boolean): string | null {
  if (isAllDay) return null;

  const start = new Date(startAt);
  const end = new Date(endAt);

  if (bangkokDay(start) !== bangkokDay(end)) {
    return `เริ่ม ${timeFmt.format(start)} น.`;
  }

  return `${timeFmt.format(start)} – ${timeFmt.format(end)} น.`;
}

/**
 * ป้ายบอกว่างานใกล้แค่ไหน เช่น 'วันนี้' / 'พรุ่งนี้' / 'อีก 5 วัน'
 * คืน null ถ้างานอยู่ไกลเกิน 30 วัน (ป้ายจะไม่มีประโยชน์)
 */
export function formatRelativeDay(startAt: string, endAt: string, now: Date = new Date()): string | null {
  const today = bangkokDay(now);
  const startDay = bangkokDay(startAt);
  const endDay = bangkokDay(endAt);

  // งานหลายวันที่เริ่มไปแล้วแต่ยังไม่จบ
  if (startDay <= today && today <= endDay) return "กำลังจัดอยู่";

  const diff = daysBetween(today, startDay);
  if (diff < 0) return null;
  if (diff === 0) return "วันนี้";
  if (diff === 1) return "พรุ่งนี้";
  if (diff <= 30) return `อีก ${diff} วัน`;
  return null;
}

/** ราคาบัตร เช่น 'เข้าฟรี' / '350 บาท' / '350 – 1,200 บาท' */
export function formatPrice(isFree: boolean, priceMin?: number, priceMax?: number): string {
  if (isFree) return "เข้าฟรี";
  if (priceMin == null && priceMax == null) return "ตรวจสอบกับผู้จัด";

  const baht = (n: number) => n.toLocaleString("th-TH");

  if (priceMin != null && priceMax != null && priceMin !== priceMax) {
    return `${baht(priceMin)} – ${baht(priceMax)} บาท`;
  }
  return `${baht(priceMin ?? priceMax!)} บาท`;
}

/**
 * ประกอบที่อยู่เต็มพร้อมชื่อจังหวัด
 *
 * คอลัมน์ address ควรเก็บแค่ระดับตำบล/อำเภอ เพราะจังหวัดเป็น foreign key แยกอยู่แล้ว
 * แต่ข้อมูลที่ผู้ใช้กรอกเข้ามาเองมักพิมพ์จังหวัดต่อท้ายมาด้วย จึงต้องกันไม่ให้
 * แสดงซ้ำเป็น 'จ.สุโขทัย จ.สุโขทัย'
 *
 * กรุงเทพฯ ไม่ใช้คำนำหน้า 'จ.' เพราะมีสถานะเป็นเขตปกครองพิเศษ ไม่ใช่จังหวัด
 */
export function formatAddress(address: string | undefined, provinceNameTh: string): string {
  const label = provinceNameTh === "กรุงเทพมหานคร" ? provinceNameTh : `จ.${provinceNameTh}`;

  if (!address) return label;
  return address.includes(provinceNameTh) ? address : `${address} ${label}`;
}

/** ระยะทาง เช่น '850 ม.' / '12.4 กม.' / '133 กม.' */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} ม.`;

  const km = meters / 1000;
  return km < 10 ? `${km.toFixed(1)} กม.` : `${Math.round(km)} กม.`;
}

// ---------------------------------------------------------------------------
// สำหรับปฏิทินเลือกช่วงวันที่ (components/date-range-picker.tsx)
//
// ฟังก์ชันกลุ่มนี้รับวันแบบ 'YYYY-MM-DD' ไม่ใช่ ISO timestamp เต็ม เพราะปฏิทินทำงาน
// กับ "วันตามปฏิทิน" ล้วนๆ ไม่เกี่ยวกับเวลา การแปลงเป็น Date จึงตรึงเป็นเที่ยงวัน UTC
// ซึ่งปลอดภัยจากการคลาดวันไม่ว่าเครื่องผู้ใช้จะอยู่เขตเวลาไหน
// ---------------------------------------------------------------------------

const monthYearFmt = new Intl.DateTimeFormat("th-TH", {
  timeZone: TZ,
  month: "long",
  year: "numeric",
});

/** แปลง 'YYYY-MM-DD' เป็น Date ที่ตรึงไว้เที่ยงวัน UTC — กันวันคลาดจากการชดเชยเขตเวลา */
function dayToDate(day: string): Date {
  return new Date(`${day}T12:00:00Z`);
}

/** หัวปฏิทิน เช่น 'กันยายน 2569' — ปีเป็น พ.ศ. อัตโนมัติจาก th-TH */
export function formatMonthYear(year: number, monthIndex: number): string {
  return monthYearFmt.format(new Date(Date.UTC(year, monthIndex, 15, 12)));
}

/** วันเดียว เช่น '3 ก.ย. 2569' */
export function formatDay(day: string): string {
  return dayMonthYearFmt.format(dayToDate(day));
}

/**
 * ข้อความช่วงวันสำหรับปุ่มเปิดปฏิทิน
 *
 * รองรับกรณีที่ผู้ใช้ระบุมาไม่ครบคู่ด้วย เพราะ from/to มาจาก URL ที่แก้เองได้
 * และตัวกรองก็อนุญาตให้ระบุแค่ด้านเดียวอยู่แล้ว (เช่น 'ตั้งแต่ 3 ก.ย. เป็นต้นไป')
 */
export function formatDayRange(from?: string, to?: string): string | null {
  if (!from && !to) return null;
  if (from && !to) return `ตั้งแต่ ${formatDay(from)}`;
  if (!from && to) return `ถึง ${formatDay(to!)}`;
  if (from === to) return formatDay(from!);

  // อยู่เดือนเดียวกัน จึงไม่ต้องเขียนเดือนซ้ำสองครั้ง — '3 – 10 ก.ย. 2569'
  const sameMonth = from!.slice(0, 7) === to!.slice(0, 7);
  const startText = sameMonth ? dayFmt.format(dayToDate(from!)) : dayMonthFmt.format(dayToDate(from!));

  return `${startText} – ${formatDay(to!)}`;
}
