/**
 * ค่าคงที่ระดับเว็บไซต์ — รวมไว้ที่เดียวเพราะถูกใช้ทั้งใน metadata, sitemap และ JSON-LD
 */

export const SITE = {
  name: "Phikadfest",
  nameTh: "พิกัดเฟส",
  tagline: "รวมงานเทศกาลและกิจกรรมทั่วไทย",
  description:
    "ค้นหางานเทศกาล งานประจำปี คอนเสิร์ต เวิร์กช็อป และกิจกรรมรวมตัวทั่วประเทศไทย ดูว่ามีงานอะไรใกล้คุณ หรือในจังหวัดที่กำลังจะไปเที่ยว",
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
