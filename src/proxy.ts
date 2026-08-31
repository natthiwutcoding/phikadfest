import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Proxy — Next.js 16 เปลี่ยนชื่อจาก middleware มาเป็นชื่อนี้ หน้าที่เหมือนเดิม
 *
 * ทำอย่างเดียวคือ **ต่ออายุ session cookie ของ Supabase** ให้ผู้ใช้ไม่หลุดล็อกอิน
 * เพราะ Server Component เขียน cookie เองไม่ได้ ต้องมีตัวกลางแบบนี้เขียนให้
 *
 * ⚠️ ตั้งใจไม่เอาการตรวจสิทธิ์มาไว้ที่นี่ ตามที่เอกสาร Next.js เตือนไว้ —
 * proxy ทำงานทุก request รวมถึง route ที่ถูก prefetch การไป query ฐานข้อมูลตรงนี้
 * จะทำให้ช้าทั้งเว็บ การตรวจสิทธิ์จริงอยู่ที่ src/lib/auth.ts ซึ่งอยู่ใกล้แหล่งข้อมูล
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  // ยังไม่ได้ตั้งค่า Supabase (โหมดข้อมูลตัวอย่าง) ก็ไม่มี session ให้ต่ออายุ
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return response;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // ต้องเขียนทั้งลงใน request (ให้โค้ดที่รันต่อจากนี้เห็นค่าใหม่)
          // และลงใน response (ให้เบราว์เซอร์เก็บไว้ใช้ครั้งหน้า)
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  // การเรียก getUser() คือสิ่งที่กระตุ้นให้ token ถูกต่ออายุเมื่อใกล้หมดเวลา
  await supabase.auth.getUser();

  return response;
}

export const config = {
  /*
    ข้ามไฟล์ static และรูปภาพ เพราะไม่ต้องใช้ session
    ถ้าไม่ข้าม จะเสียเวลาต่ออายุ token ทุกครั้งที่โหลดไอคอนหรือฟอนต์
  */
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
