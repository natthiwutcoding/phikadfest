import "server-only";

import type { ValidCoverImage } from "@/lib/event-validation";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * อัปโหลดรูปปกงานขึ้น Supabase Storage
 *
 * ── ทำไมต้องใช้ service role ──
 * bucket `event-covers` ตั้งใจไม่มี policy อนุญาตเขียนเลย (ดู migration 0004)
 * ทางเดียวที่เขียนได้จึงเป็น service role ฝั่งเซิร์ฟเวอร์ ซึ่งบังคับให้ทุกไฟล์ต้องผ่าน
 * validation ใน Server Action ก่อนเสมอ — ต่างจากการเปิด policy ให้ client อัปโหลดตรง
 * ที่จะข้ามการตรวจทั้งหมดไปได้
 *
 * ── ทำไมล้มเหลวแล้วไม่ throw ──
 * คืน null แทนการโยน error เพราะงานที่ไม่มีรูปยังมีประโยชน์เต็มที่ (การ์ดมีภาพประกอบ
 * สำรองอยู่แล้ว) ไม่คุ้มที่จะทิ้งข้อมูลงานที่กรอกมาครบเพราะ Storage มีปัญหาชั่วคราว
 */
export async function uploadCoverImage(cover: ValidCoverImage): Promise<string | null> {
  const supabase = createSupabaseAdminClient();

  // ชื่อไฟล์สุ่มจากฝั่งเซิร์ฟเวอร์ ไม่เอาชื่อเดิมของผู้ใช้มาใช้
  // เพราะชื่อไฟล์ที่ผู้ใช้ตั้งอาจมีอักขระที่ทำให้ path เพี้ยน หรือชนกันเองได้
  const path = `${crypto.randomUUID()}.${cover.extension}`;

  const { error } = await supabase.storage
    .from("event-covers")
    .upload(path, cover.file, { contentType: cover.file.type });

  if (error) {
    console.error("[cover] อัปโหลดรูปปกไม่สำเร็จ:", error.message);
    return null;
  }

  return supabase.storage.from("event-covers").getPublicUrl(path).data.publicUrl;
}
