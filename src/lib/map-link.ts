import "server-only";

import { findNearestProvince } from "@/lib/map-camera";
import type { Province } from "@/lib/types";

/**
 * แปลงลิงก์ Google Maps เป็นพิกัด
 *
 * มีไว้เพราะแทบไม่มีใครหา lat/lng เป็น แต่ทุกคนก๊อปลิงก์แผนที่เป็น
 * การให้แปะลิงก์จึงเป็นทางเดียวที่จะได้พิกัดจากคนกรอกข้อมูลจริง
 *
 * server-only เพราะการตามลิงก์ย่อต้องยิง request ออกไป ซึ่งทำฝั่งเบราว์เซอร์ไม่ได้ (CORS)
 * และไม่ควรให้ทำด้วย
 */

/** ผลลัพธ์ของการแปลงลิงก์ — แยกสำเร็จ/ล้มเหลวให้ชัด ผู้เรียกจะได้จัดการถูก */
export type MapLinkResult =
  | { ok: true; lat: number; lng: number; province: Province }
  | { ok: false; reason: string };

/**
 * โฮสต์ที่ยอมให้เซิร์ฟเวอร์ยิง request ไปตาม
 *
 * ⚠️ จำเป็นต่อความปลอดภัย ห้ามเปิดกว้าง — การให้เซิร์ฟเวอร์ยิงไปยัง URL ที่ผู้ใช้ส่งมา
 * โดยไม่จำกัดปลายทาง เปิดช่องให้คนร้ายใช้เซิร์ฟเวอร์เราเป็นบันไดยิงเข้าเครือข่ายภายใน
 * (ช่องโหว่ประเภท SSRF) เช่นส่ง http://169.254.169.254 เพื่อขโมย credential ของ cloud
 */
const ALLOWED_HOSTS = new Set([
  "maps.app.goo.gl",
  "goo.gl",
  "google.com",
  "www.google.com",
  "maps.google.com",
  "google.co.th",
  "www.google.co.th",
  "maps.google.co.th",
]);

/** ตามรีไดเรกต์ได้ไม่เกินนี้ กันลิงก์ที่วนไม่รู้จบ */
const MAX_REDIRECTS = 5;

/** ลิงก์ย่อที่ต้องตามรีไดเรกต์ก่อนถึงจะเจอพิกัด */
const SHORT_LINK_HOSTS = new Set(["maps.app.goo.gl", "goo.gl"]);

function isValidCoordinate(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    // (0,0) กลางมหาสมุทรแอตแลนติก เป็นค่าที่มักโผล่มาเวลา parse พลาด ไม่ใช่พิกัดจริงที่คนตั้งใจ
    !(lat === 0 && lng === 0)
  );
}

/**
 * ดึงพิกัดออกจาก URL
 *
 * เรียงตามความแม่นยำ เพราะลิงก์เดียวมักมีพิกัดหลายชุดปนกัน:
 *   1. !3d..!4d..  = พิกัดของสถานที่จริงที่ปักหมุดไว้ — แม่นที่สุด
 *   2. @lat,lng    = จุดกึ่งกลางจอตอนที่ก๊อปลิงก์ อาจเยื้องจากสถานที่จริง
 *   3. q= / ll=    = พิกัดที่ระบุมาตรงๆ
 */
function extractCoordinates(url: string): { lat: number; lng: number } | null {
  const placeMatch = /!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/.exec(url);
  if (placeMatch) {
    const lat = Number(placeMatch[1]);
    const lng = Number(placeMatch[2]);
    if (isValidCoordinate(lat, lng)) return { lat, lng };
  }

  const atMatch = /@(-?\d+\.?\d*),(-?\d+\.?\d*)/.exec(url);
  if (atMatch) {
    const lat = Number(atMatch[1]);
    const lng = Number(atMatch[2]);
    if (isValidCoordinate(lat, lng)) return { lat, lng };
  }

  const queryMatch = /[?&](?:q|ll|center)=(-?\d+\.?\d*),(-?\d+\.?\d*)/.exec(url);
  if (queryMatch) {
    const lat = Number(queryMatch[1]);
    const lng = Number(queryMatch[2]);
    if (isValidCoordinate(lat, lng)) return { lat, lng };
  }

  return null;
}

/** ตรวจว่าเป็น URL ที่ยอมให้ยิงไปหา — คืน URL ที่ parse แล้วถ้าผ่าน */
function parseAllowedUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return ALLOWED_HOSTS.has(url.hostname) ? url : null;
}

/**
 * ตามรีไดเรกต์ของลิงก์ย่อจนเจอ URL เต็ม
 *
 * ตามเองทีละขั้นแทนการใช้ redirect: "follow" ของ fetch เพราะต้องตรวจทุกปลายทางระหว่างทาง
 * ว่ายังอยู่ในโฮสต์ที่อนุญาต — ไม่งั้นลิงก์ย่อของ Google อาจถูกตั้งให้พาไปที่ไหนก็ได้
 */
async function resolveShortLink(url: URL): Promise<string | null> {
  let current = url;

  for (let hop = 0; hop < MAX_REDIRECTS; hop += 1) {
    let response: Response;
    try {
      response = await fetch(current.toString(), {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      return null;
    }

    const location = response.headers.get("location");
    if (!location) {
      // ไม่รีไดเรกต์ต่อแล้ว — URL ปัจจุบันคือปลายทาง
      return current.toString();
    }

    const next = parseAllowedUrl(new URL(location, current).toString());
    if (!next) return null;

    // เจอพิกัดแล้วหยุดได้เลย ไม่ต้องตามต่อ
    if (extractCoordinates(next.toString())) return next.toString();
    current = next;
  }

  return null;
}

/**
 * แปลงลิงก์ Google Maps เป็นพิกัดพร้อมจังหวัดที่พิกัดนั้นอยู่
 *
 * คืนจังหวัดมาด้วยเพื่อให้ผู้เรียกเตือนได้ ถ้าผู้ใช้เลือกจังหวัดไม่ตรงกับลิงก์ที่แปะ
 */
export async function resolveMapLink(rawLink: string): Promise<MapLinkResult> {
  const trimmed = rawLink.trim();
  if (!trimmed) return { ok: false, reason: "ยังไม่ได้ใส่ลิงก์" };

  const url = parseAllowedUrl(trimmed);
  if (!url) {
    return {
      ok: false,
      reason: "รองรับเฉพาะลิงก์จาก Google Maps เท่านั้น ลองก๊อปลิงก์จากปุ่มแชร์ในแอปดู",
    };
  }

  let target = url.toString();

  if (SHORT_LINK_HOSTS.has(url.hostname) && !extractCoordinates(target)) {
    const resolved = await resolveShortLink(url);
    if (!resolved) {
      return { ok: false, reason: "เปิดลิงก์ย่อไม่สำเร็จ ลองใช้ลิงก์แบบเต็มจากเบราว์เซอร์แทน" };
    }
    target = resolved;
  }

  const coords = extractCoordinates(target);
  if (!coords) {
    return {
      ok: false,
      reason: "หาพิกัดในลิงก์ไม่เจอ — เปิด Google Maps บนคอมแล้วก๊อป URL จากแถบที่อยู่จะได้ผลดีที่สุด",
    };
  }

  // ใช้ตัวเดียวกับที่แผนที่ใช้หาจังหวัดจากตำแหน่งผู้ใช้ ตัดที่ระยะ 300 กม. จากทุกจังหวัด
  const province = findNearestProvince(coords.lat, coords.lng);
  if (!province) {
    return { ok: false, reason: "พิกัดนี้อยู่นอกประเทศไทย" };
  }

  return { ok: true, ...coords, province };
}
