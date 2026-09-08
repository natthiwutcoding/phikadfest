import "server-only";

import { pointMatchesProvince } from "@/lib/map-camera";
import { resolveMapLink } from "@/lib/map-link";
import type { Province } from "@/lib/types";

/**
 * แปลงลิงก์ Google Maps ที่ผู้ใช้แปะมาเป็นพิกัด พร้อมค้านเมื่อไม่เข้ากับจังหวัดที่เลือก
 *
 * ใช้ร่วมกันระหว่างฟอร์มแจ้งงานสาธารณะกับฟอร์มของแอดมิน — กฎการตัดสินว่าพิกัด "เข้ากัน"
 * กับจังหวัดไหนต้องเหมือนกันทั้งสองทาง ไม่งั้นงานที่แอดมินกรอกเองกับงานที่คนส่งเข้ามา
 * จะถูกตัดสินคนละมาตรฐาน
 *
 * แยกจาก Server Action เพราะต้องยิง request ออกไปตามลิงก์ย่อ (ทำใน validation ไม่ได้
 * เพราะที่นั่นเป็นฟังก์ชันบริสุทธิ์ล้วนเพื่อให้ทดสอบได้)
 */
export type EventLocationResult =
  | { ok: true; lat: number | null; lng: number | null }
  | { ok: false; message: string; reason: string };

export async function resolveEventCoordinates(
  mapLink: string,
  province: Province,
): Promise<EventLocationResult> {
  // ลิงก์แผนที่ไม่บังคับ — งานที่รู้แค่จังหวัดก็ยังนับรวมในสีความหนาแน่นบนแผนที่ได้
  if (!mapLink) return { ok: true, lat: null, lng: null };

  const resolved = await resolveMapLink(mapLink);

  if (!resolved.ok) {
    return { ok: false, message: "ลิงก์แผนที่ใช้ไม่ได้", reason: resolved.reason };
  }

  /*
    ค้านเมื่อพิกัดไม่เข้ากับจังหวัดที่เลือก — มักเกิดจากก๊อปลิงก์ผิดที่

    ห้ามเทียบ resolved.province ตรงๆ เพราะค่านั้นหาจากระยะถึงตัวเมือง ซึ่งตอบผิด
    สำหรับพัทยา จอมเทียน และสัตหีบ (อยู่ชลบุรี แต่ใกล้ตัวเมืองระยองมากกว่า)
    — คือสถานที่จัดงานที่คนแจ้งเข้ามาบ่อยที่สุดในภาคนี้ ดูรายละเอียดใน pointMatchesProvince()
  */
  if (!pointMatchesProvince(province.code, resolved.lat, resolved.lng)) {
    return {
      ok: false,
      message: `ลิงก์แผนที่ชี้ไปที่${resolved.province.nameTh} แต่เลือกจังหวัดเป็น${province.nameTh} — ตรวจสอบอีกครั้ง`,
      reason: `พิกัดในลิงก์อยู่ใน${resolved.province.nameTh}`,
    };
  }

  return { ok: true, lat: resolved.lat, lng: resolved.lng };
}
