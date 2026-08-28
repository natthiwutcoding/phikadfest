/**
 * คำนวณระยะทางบนผิวโลก
 *
 * ใช้เฉพาะกับ sample data ตอนที่ยังไม่ได้ต่อ Supabase
 * เมื่อย้ายไป Supabase แล้ว งานนี้จะเป็นหน้าที่ของ PostGIS (ST_Distance / ST_DWithin)
 * ซึ่งใช้ GIST index ได้ ต่างจากการคำนวณทีละแถวแบบนี้ที่ต้องวนทั้งตาราง
 */

const EARTH_RADIUS_M = 6_371_000;

const toRad = (deg: number) => (deg * Math.PI) / 180;

/** ระยะทางเป็นเมตรระหว่างพิกัดสองจุด (สูตร haversine) */
export function haversineMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
