import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * ชั้นตรวจสิทธิ์ (Data Access Layer)
 *
 * เอกสารของ Next.js แนะนำให้ตรวจสิทธิ์ไว้ใกล้แหล่งข้อมูล ไม่ใช่ที่ layout
 * เพราะ layout ไม่ re-render ตอนเปลี่ยนหน้า และไม่ได้ควบคุมว่าหน้าลูกจะ render หรือไม่
 * การรวมไว้ที่เดียวแบบนี้ยังกันไม่ให้เผลอลืมเช็คในหน้าใดหน้าหนึ่งด้วย
 *
 * ห่อด้วย React.cache เพื่อให้เรียกซ้ำใน request เดียวไม่ยิงถาม Supabase หลายรอบ
 */

export interface AdminSession {
  userId: string;
  email: string | null;
}

/**
 * ตั้งค่า Supabase แล้วหรือยัง
 *
 * ต้องเช็คก่อนเรียก createSupabaseServerClient() ทุกครั้ง เพราะตัวมันจะ throw ทันที
 * ถ้าไม่มี URL/key ทำให้หน้าเว็บพัง 500 แทนที่จะบอกผู้ใช้ว่ายังไม่ได้ตั้งค่า
 */
export const SUPABASE_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

/**
 * ผู้ใช้ที่ล็อกอินอยู่ หรือ null ถ้ายังไม่ได้ล็อกอิน
 *
 * ใช้ getUser() ไม่ใช่ getSession() เพราะ getUser() ยืนยัน token กับเซิร์ฟเวอร์ Supabase จริง
 * ส่วน getSession() อ่านจาก cookie อย่างเดียวซึ่งปลอมได้ จึงไม่ควรใช้ตัดสินใจเรื่องสิทธิ์
 */
export const getCurrentUser = cache(async () => {
  if (!SUPABASE_CONFIGURED) return null;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

/** true เมื่อผู้ใช้ปัจจุบันมี role เป็น admin ในตาราง profiles */
export const isCurrentUserAdmin = cache(async (): Promise<boolean> => {
  const user = await getCurrentUser();
  if (!user) return false;

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

  return data?.role === "admin";
});

/**
 * บังคับว่าต้องเป็นแอดมิน ไม่ใช่ก็เด้งออก — เรียกที่ต้นทางของทุกหน้าและ action ในส่วนแอดมิน
 *
 * นี่เป็นการป้องกันชั้นที่หนึ่ง ส่วนชั้นที่สองคือ RLS policy `is_admin()` ที่ฐานข้อมูล
 * ซึ่งทำงานแม้โค้ดฝั่งแอปจะพลาด (ดู supabase/migrations/0001_init.sql)
 */
export async function requireAdmin(): Promise<AdminSession> {
  if (!SUPABASE_CONFIGURED) redirect("/login?error=not-configured");

  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin");

  if (!(await isCurrentUserAdmin())) redirect("/login?error=forbidden");

  return { userId: user.id, email: user.email ?? null };
}
