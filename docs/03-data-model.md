# Data Model และการต่อฐานข้อมูล

> อัปเดตล่าสุด: 2026-08-19
> ไฟล์จริงอยู่ที่ `supabase/migrations/`

## ตารางหลัก

```
provinces ──┐
            ├──< events >──┬── event_tags >── tags
categories ─┘              └── bookmarks
                    │
profiles ───────────┘  (submitted_by / reviewed_by)
```

| ตาราง | หน้าที่ |
|---|---|
| `provinces` | 77 จังหวัด พร้อมภาคและพิกัดตัวเมือง (ข้อมูลอ้างอิง อ่านอย่างเดียว) |
| `categories` | หมวดหมู่งาน — เป็นตารางไม่ใช่ enum จะได้เพิ่มหมวดใหม่โดยไม่ต้อง migrate |
| `events` | ตารางหลัก เก็บทุกอย่างของงานหนึ่งครั้ง |
| `tags` / `event_tags` | แท็กเสริม (หมวดหมู่มีได้อันเดียว แต่แท็กมีได้หลายอัน) |
| `profiles` | ขยายจาก `auth.users` เพื่อเก็บ role (`user` / `organizer` / `admin`) |
| `bookmarks` | Phase 2 — งานที่ผู้ใช้บันทึกไว้ |

## การตัดสินใจด้าน schema ที่ควรรู้

### `location` เป็น generated column

```sql
location geography(Point, 4326) generated always as (
  st_setsrid(st_makepoint(lng, lat), 4326)::geography
) stored
```

เขียนแค่ `lat` / `lng` แล้ว Postgres สร้าง `location` ให้เอง — ไม่มีทางที่พิกัดสองชุดจะไม่ตรงกัน
ระวัง: `ST_MakePoint` รับ **(lng, lat)** สลับกับลำดับที่คนทั่วไปคุ้นเคย

### งานประจำปีเก็บเป็นหลายแถว ไม่ใช่กฎ recurrence

งานเทศกาลไทยจำนวนมากยึดปฏิทินจันทรคติ (ลอยกระทง สงกรานต์ แห่เทียนพรรษา) วันจัดจึงเลื่อนทุกปี
และผู้จัดมักปรับวันตามความเหมาะสมอีก การเก็บกฎ "ทุกวันเพ็ญเดือน 12" จึงคำนวณล่วงหน้าไม่ได้จริง

แต่ละครั้งที่จัดจึงเป็นหนึ่งแถว ผูกกันด้วย `series_id` เพื่อให้ยังลิงก์ไปดูปีก่อนหน้าได้

### `status` ควบคุมทุกอย่างที่เกี่ยวกับ moderation

ค่า `pending` → `approved` / `rejected` งานที่ยังไม่ approved จะไม่โผล่บนหน้าเว็บ
บังคับที่ระดับฐานข้อมูลด้วย RLS ไม่ใช่แค่ที่โค้ดฝั่งแอป — ถ้าเผลอลืมใส่เงื่อนไขในโค้ด
ฐานข้อมูลก็ยังไม่ยอมส่งข้อมูลออกมาอยู่ดี

### `pg_trgm` แทน full-text search

Postgres full-text search ตัดคำภาษาไทยไม่ได้ (ไทยไม่มีช่องว่างระหว่างคำ) จึงใช้ trigram index
ซึ่งค้นหาคำที่อยู่กลางข้อความไทยได้ ดูรายละเอียดใน `02-tech-stack.md`

## ฟังก์ชัน `events_nearby`

หัวใจของฟีเจอร์ "งานใกล้ฉัน" — เขียนเป็น SQL function เพราะ Supabase client
ยิง PostGIS operator ตรงๆ ไม่ได้

```ts
const { data } = await supabase.rpc("events_nearby", {
  p_lat: 13.7563,
  p_lng: 100.5018,
  p_radius_m: 100000,
});
```

`ST_DWithin` ใช้ GIST index จึงกรองก่อนคำนวณระยะทางจริง ต่างจากการวนคำนวณทุกแถว
ซึ่งช้าลงเรื่อยๆ ตามจำนวนข้อมูล

---

## การย้ายจาก sample data ไป Supabase

ตอนนี้แอปอ่านข้อมูลจาก `src/lib/data/sample-events.ts` เพื่อให้พัฒนา UI ได้ก่อนมีฐานข้อมูล
ทุกหน้าเรียกผ่าน `src/lib/events.ts` เท่านั้น การสลับจึงแก้ที่ไฟล์เดียว

### ขั้นตอน

1. **สร้างโปรเจกต์ Supabase** ที่ [supabase.com](https://supabase.com) — เลือก region ที่ใกล้ไทยที่สุด
   (Singapore) เพื่อลด latency

2. **รัน migration** เปิด SQL Editor แล้วรันไฟล์ตามลำดับ:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_seed_reference.sql`

3. **ติดตั้ง client**

   ```bash
   npm install @supabase/supabase-js @supabase/ssr
   ```

4. **ใส่ค่า environment variables** คัดลอก `.env.example` เป็น `.env.local` แล้วกรอกค่าจาก
   Supabase Dashboard → Project Settings → API

5. **เขียนฟังก์ชันใน `src/lib/events.ts` ใหม่** ให้ query จริงแทนการอ่าน sample data
   โดย **ห้ามเปลี่ยน signature ของฟังก์ชัน** — ถ้า `listEvents(filters)` ยังคืน
   `EventWithRelations[]` เหมือนเดิม ทุกหน้าจะทำงานต่อได้โดยไม่ต้องแก้อะไรเลย

6. **เขียนโค้ดบันทึกในฟอร์มแจ้งงาน** ที่ `src/app/submit/actions.ts` (มี `TODO(Supabase)` ทำเครื่องหมายไว้)

7. **ตั้งค่าแอดมินคนแรก** — สมัครสมาชิกผ่านเว็บ แล้วรันใน SQL Editor:

   ```sql
   update profiles set role = 'admin' where id = '<user-id-ของคุณ>';
   ```

เมื่อตั้งค่า `NEXT_PUBLIC_SUPABASE_URL` แล้ว แบนเนอร์ "โหมดพัฒนา" จะหายไปเอง
เพราะ `USING_SAMPLE_DATA` ใน `src/lib/events.ts` เช็คค่านี้อยู่

### สิ่งที่ต้องระวังตอนย้าย

- **ชื่อคอลัมน์ต่างกัน** — DB ใช้ `snake_case` แต่ TypeScript ใช้ `camelCase` ต้องแปลงตอน map
- **`lat` / `lng` เป็น nullable** — งานที่ยังไม่มีพิกัดต้อง fallback ไปใช้พิกัดจังหวัด
  (โค้ดใน `findNearbyEvents` ทำไว้แล้ว)
- **อย่าเอา `SUPABASE_SERVICE_ROLE_KEY` ไปใช้ฝั่ง client เด็ดขาด** — คีย์นี้ข้าม RLS ได้ทั้งหมด
  ใช้ได้เฉพาะใน Server Action หรือ API route เท่านั้น และห้ามตั้งชื่อขึ้นต้นด้วย `NEXT_PUBLIC_`
