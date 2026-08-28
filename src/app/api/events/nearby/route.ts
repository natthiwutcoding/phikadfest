import { findNearbyEvents } from "@/lib/events";

/**
 * GET /api/events/nearby?lat=13.75&lng=100.50&radius=100000&category=music
 *
 * ทำเป็น API route แยก (ไม่ใช่ Server Component) เพราะพิกัดผู้ใช้ได้มาจาก
 * navigator.geolocation ซึ่งอยู่ฝั่งเบราว์เซอร์เท่านั้น — เซิร์ฟเวอร์รู้ไม่ได้ตอน render
 *
 * endpoint นี้จะเป็นตัวเดียวกับที่แอปมือถือเรียกได้ในอนาคต ถ้าตัดสินใจทำ native app
 */

const MAX_RADIUS_M = 300_000;
const DEFAULT_RADIUS_M = 100_000;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const lat = Number(searchParams.get("lat"));
  const lng = Number(searchParams.get("lng"));

  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return Response.json({ error: "พิกัดไม่ถูกต้อง" }, { status: 400 });
  }

  const requestedRadius = Number(searchParams.get("radius"));
  const radiusM = Number.isFinite(requestedRadius)
    ? Math.min(Math.max(requestedRadius, 1_000), MAX_RADIUS_M)
    : DEFAULT_RADIUS_M;

  const categorySlug = searchParams.get("category") ?? undefined;

  const events = await findNearbyEvents({ lat, lng, radiusM, categorySlug, limit: 20 });

  return Response.json(
    { events, radiusM },
    {
      // ผลลัพธ์ผูกกับพิกัดของผู้ใช้แต่ละคน จึงห้าม CDN cache ไว้แชร์กัน
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
