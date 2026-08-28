# Phikadfest — เว็บรวมงานเทศกาลไทย

Next.js 16 + Tailwind v4 · ธีม Dark เดียว · เหตุผลเบื้องหลังอยู่ใน `docs/`
Next 16 ต่างจากที่โมเดลรู้ — อ่าน `node_modules/next/dist/docs/` ก่อนเขียนโค้ด

## กฎ

- UI/docs ไทย · โค้ด/commit อังกฤษ
- วันเวลา: ใช้ `lib/format.ts` เท่านั้น (ตรึง Asia/Bangkok) ไม่งั้น hydration พัง วันเพี้ยน
- ข้อมูล: อ่านผ่าน `lib/events.ts` เท่านั้น ห้าม query ใน page
- `lib/data/sample-events.ts` = งานปลอม ห้ามขึ้น production
- `lib/data/provinces.ts` ↔ `supabase/migrations/0002_seed_reference.sql` แก้คู่กันเสมอ
- `lib/data/province-paths.ts` สร้างด้วย `npm run build:map` ห้ามแก้มือ
- หน้าแสดงงานต้อง SSR + JSON-LD (`lib/structured-data.ts`) — SEO คือช่องทางโตหลัก
- `app/(site)/` มี footer · `app/map/` ไม่มี

## เสร็จเมื่อ

`npx tsc --noEmit && npm run lint && npm run build` ผ่าน
(`PageProps`/`LayoutProps` หาไม่เจอ → `npx next typegen`)
