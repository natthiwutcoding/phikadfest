import { createBrowserClient } from "@supabase/ssr";

/**
 * ตัวเชื่อม Supabase สำหรับ Client Component (รันในเบราว์เซอร์)
 *
 * ใช้ anon key ซึ่ง**ออกแบบมาให้เปิดเผยได้**อยู่แล้ว — ไม่ใช่ความลับ
 * เพราะโค้ดฝั่ง client ถูกดาวน์โหลดไปรันในเบราว์เซอร์ผู้ใช้ทุกคน ใครก็เปิดดูได้
 * สิ่งที่ป้องกันข้อมูลจริงคือ Row Level Security ที่ตั้งไว้ในฐานข้อมูล
 * (ดู supabase/migrations/0001_init.sql) ไม่ใช่การซ่อนคีย์
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
