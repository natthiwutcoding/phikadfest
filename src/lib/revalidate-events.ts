import "server-only";

import { revalidatePath } from "next/cache";

/**
 * ล้าง cache ของทุกหน้าที่แสดงข้อมูลงาน
 *
 * ต้องเรียกหลังทุกการเปลี่ยนแปลงที่กระทบสิ่งที่ผู้ใช้เห็น (อนุมัติ ปฏิเสธ เพิ่ม แก้ไข)
 * ไม่งั้นงานที่เพิ่งอนุมัติจะยังไม่ขึ้นหน้าแรกจนกว่า cache จะหมดอายุเอง
 *
 * รวมไว้ที่เดียวเพราะรายการหน้าที่ต้องล้างจะยาวขึ้นเรื่อยๆ เมื่อเว็บโตขึ้น —
 * ถ้าปล่อยให้แต่ละ action เขียนเอง วันที่เพิ่มหน้าใหม่จะมี action ที่ลืมล้างเสมอ
 *
 * @param slug ระบุเมื่อรู้ว่างานไหนเปลี่ยน เพื่อล้างหน้ารายละเอียดของงานนั้นด้วย
 */
export function revalidateEventPages(slug?: string | null): void {
  revalidatePath("/");
  revalidatePath("/events");
  revalidatePath("/map");
  revalidatePath("/admin");

  if (slug) revalidatePath(`/events/${slug}`);
}
