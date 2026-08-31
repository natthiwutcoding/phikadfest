import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * ตัวเชื่อม Supabase ที่ข้าม Row Level Security ได้ทั้งหมด
 *
 * ── ทำไมต้องมี ──
 * ฟอร์มแจ้งงานต้องใช้ได้โดยไม่ต้องล็อกอิน แต่ถ้าเปิด RLS policy ให้ anon insert ตรงๆ
 * จะเท่ากับเปิดให้ใครก็ยิงเข้า REST API ของ Supabase ได้โดยไม่ผ่านโค้ดของเรา
 * (anon key เป็นค่าสาธารณะที่อ่านได้จากเบราว์เซอร์) แปลว่า validation ทุกอย่างที่เขียนไว้
 * ใน Server Action ถูกข้ามทิ้งหมด — ยัดข้อความยาวเท่าไรก็ได้ ใส่ลิงก์อันตรายก็ได้ สแปมก็ได้
 *
 * จึงปิด anon insert ทิ้ง แล้วให้การบันทึกผ่านทางนี้ทางเดียว ซึ่งบังคับให้ทุก request
 * ต้องผ่าน validation ฝั่งเซิร์ฟเวอร์ก่อนเสมอ
 *
 * ── ข้อบังคับในการใช้ ──
 * 1. ใช้เฉพาะการ insert ของฟอร์มแจ้งงานเท่านั้น งานอื่นให้ใช้ createSupabaseServerClient()
 *    ที่เคารพ RLS ตามปกติ
 * 2. ห้ามส่งค่าจากผู้ใช้เข้าไปตรงๆ โดยไม่ผ่าน validation ก่อน เพราะไม่มี RLS คอยกันให้แล้ว
 * 3. `server-only` ด้านบนทำให้ build พังทันทีถ้ามีใครเผลอ import เข้าฝั่ง client
 */
export function createSupabaseAdminClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!serviceRoleKey) {
    throw new Error(
      "ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY — ดูขั้นตอนใน docs/03-data-model.md",
    );
  }

  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
    auth: {
      // ไม่มีผู้ใช้ให้จำ session และไม่ควรต่ออายุ token อัตโนมัติ
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/** true เมื่อตั้งค่า service role key แล้ว — ใช้เช็คก่อนเรียก เพื่อไม่ให้หน้าเว็บพัง */
export const SERVICE_ROLE_CONFIGURED = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
