/**
 * ตัวช่วยอ่านค่าจาก searchParams ของ Next.js
 *
 * Next ให้ค่ามาเป็น `string | string[] | undefined` เสมอ เพราะ query string
 * ใส่คีย์ซ้ำได้ (`?province=a&province=b`) แต่ทุกหน้าในเว็บนี้สนใจแค่ค่าเดียว
 * จึงรวมกติกา "เอาตัวแรก ตัดช่องว่าง ค่าว่างถือว่าไม่ได้ระบุ" ไว้ที่เดียว
 */

/** ค่าเดียวที่ใช้ได้จริงจาก searchParams — คืน undefined เมื่อไม่มีค่าหรือมีแต่ช่องว่าง */
export function readParam(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single?.trim() || undefined;
}
