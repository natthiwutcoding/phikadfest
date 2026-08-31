import "server-only";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * ตัวเชื่อม Supabase สำหรับฝั่งเซิร์ฟเวอร์ (Server Component / Server Action / Route Handler)
 *
 * ต้อง await cookies() เพราะ Next.js 15 ขึ้นไปเปลี่ยนให้เป็น async
 *
 * `server-only` ที่ import ไว้บนสุดเป็นตัวกันพลาด — ถ้ามีใครเผลอ import ไฟล์นี้
 * เข้าไปใน Client Component จะ build ไม่ผ่านทันที แทนที่จะหลุดไปรันในเบราว์เซอร์
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Server Component เขียน cookie ไม่ได้ (เขียนได้เฉพาะใน Server Action / Route Handler)
            // ไม่เป็นไร เพราะ proxy.ts เป็นตัวต่ออายุ session cookie ให้อยู่แล้ว
          }
        },
      },
    },
  );
}
