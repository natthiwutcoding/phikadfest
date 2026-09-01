import { ACTIVE_PROVINCES, ACTIVE_REGION_LABEL } from "@/lib/region-scope";

/**
 * ค่าคงที่ระดับเว็บไซต์ — รวมไว้ที่เดียวเพราะถูกใช้ทั้งใน metadata, sitemap และ JSON-LD
 */

/** ชื่อจังหวัดในขอบเขต คั่นด้วยเว้นวรรค — ใส่ใน meta description เพื่อจับคำค้นรายจังหวัด */
const ACTIVE_PROVINCE_NAMES = ACTIVE_PROVINCES.map((province) => province.nameTh).join(" ");

/**
 * ข้อความบอกขอบเขตพื้นที่มาจาก `region-scope.ts` จุดเดียว ไม่ได้พิมพ์ "ภาคตะวันออก" ตายตัว
 * เพราะวันที่ขยายไปภาคอื่นหรือกลับไปทั่วประเทศ จะได้ไม่ต้องไล่แก้ข้อความทีละหน้า
 * (ค่านี้ไหลไปเข้า metadata, OG, JSON-LD และ footer ให้อัตโนมัติ)
 */
export const SITE = {
  name: "Phikadfest",
  nameTh: "พิกัดเฟส",
  tagline: `รวมงานเทศกาลและกิจกรรม${ACTIVE_REGION_LABEL}`,
  description: `ค้นหางานเทศกาล งานประจำปี คอนเสิร์ต เวิร์กช็อป และกิจกรรมรวมตัวใน${ACTIVE_REGION_LABEL} ${ACTIVE_PROVINCE_NAMES} ดูว่ามีงานอะไรใกล้คุณ หรือในจังหวัดที่กำลังจะไปเที่ยว`,
} as const;

/**
 * URL หลักของเว็บ ใช้สร้าง canonical URL, OG image และ sitemap
 *
 * ตั้งค่า NEXT_PUBLIC_SITE_URL ใน environment variables ของ Vercel ตอน deploy
 * ถ้าไม่ตั้ง ระบบจะ fallback ไป localhost ซึ่งทำให้ลิงก์ที่แชร์ออกไปใช้ไม่ได้
 */
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000";

export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}
