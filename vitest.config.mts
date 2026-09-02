import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * ตั้งค่าชุดทดสอบ
 *
 * ทดสอบเฉพาะฟังก์ชันบริสุทธิ์ใน `src/lib/` — ตรรกะที่พังแล้วเจ็บและมองด้วยตาไม่เห็น
 * (คณิตศาสตร์ของกล้องแผนที่ การจัดกลุ่มหมุด การจัดรูปแบบวันไทย และการตรวจฟอร์ม)
 * ส่วน component กับการ query ฐานข้อมูลตรวจด้วยการเปิดหน้าเว็บจริง ไม่คุ้มที่จะ mock
 *
 * ตั้ง alias `@/` เองแทนการลง plugin เพิ่ม เพราะโปรเจกต์ใช้ path เดียวคือ `@/*` → `src/*`
 * (ต้องตรงกับ paths ใน tsconfig.json เสมอ)
 *
 * ⚠️ ตรึง TZ เป็น UTC ตอนรันเทสต์ — จงใจให้ต่างจากเวลาไทย เพื่อให้เทสต์ของ lib/format.ts
 * จับได้จริงถ้ามีใครเผลอใช้เวลาท้องถิ่นของเครื่องแทนการตรึง Asia/Bangkok
 * (Vercel รันด้วย UTC เหมือนกัน เทสต์จึงจำลองสภาพ production ไปในตัว)
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: { TZ: "UTC" },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
