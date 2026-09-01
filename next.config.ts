import type { NextConfig } from "next";

/**
 * โฮสต์ของ Supabase Storage ที่เก็บรูปปกงาน
 *
 * ดึงจาก NEXT_PUBLIC_SUPABASE_URL แทนการพิมพ์ตายตัว เพราะ URL ของโปรเจกต์
 * ต่างกันระหว่างเครื่อง dev กับ production — ถ้า hardcode ไว้ รูปจะพังบนอีกที่หนึ่ง
 */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    /*
      next/image ปฏิเสธโดเมนภายนอกที่ไม่อยู่ในรายการนี้ เพื่อไม่ให้เว็บเราถูกใช้
      เป็นตัวแปลงรูปฟรีให้โดเมนอื่น จำกัด pathname ไว้เฉพาะโฟลเดอร์ public ของ Storage
      เพื่อให้แคบที่สุดเท่าที่ใช้งานจริง
    */
    remotePatterns: supabaseHost
      ? [
          {
            protocol: "https",
            hostname: supabaseHost,
            pathname: "/storage/v1/object/public/**",
          },
        ]
      : [],
  },
};

export default nextConfig;
