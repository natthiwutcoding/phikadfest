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

**โค้ดฝั่งแอปเขียนเสร็จแล้วทั้งหมด** เหลือแค่ตั้งค่าฝั่ง Supabase:

1. **สร้างโปรเจกต์ Supabase** ที่ [supabase.com](https://supabase.com) — เลือก region ที่ใกล้ไทยที่สุด
   (Singapore) เพื่อลด latency

2. **รัน migration** เปิด SQL Editor แล้วรันไฟล์ตามลำดับ:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_seed_reference.sql`

3. **ใส่ค่า environment variables** คัดลอก `.env.example` เป็น `.env.local` แล้วกรอกค่าจาก
   Supabase Dashboard → Project Settings → API

4. **ตั้งค่าแอดมินคนแรก** — สมัครสมาชิกผ่าน Supabase Dashboard (Authentication → Users → Add user)
   แล้วรันใน SQL Editor:

   ```sql
   update profiles set role = 'admin' where id = '<user-id-ของคุณ>';
   ```

   จากนั้นเข้า `/login` บนเว็บด้วยบัญชีนั้น แล้วจะเข้าหน้า `/admin` ได้

เมื่อตั้งค่า `NEXT_PUBLIC_SUPABASE_URL` แล้ว แบนเนอร์ "โหมดพัฒนา" จะหายไปเอง
เพราะ `USING_SAMPLE_DATA` ใน `src/lib/events.ts` เช็คค่านี้อยู่ — ถ้าลบค่านี้ออก
แอปจะกลับไปใช้ข้อมูลตัวอย่างโดยอัตโนมัติ ทำให้พัฒนา UI ต่อได้โดยไม่ต้องต่อฐานข้อมูล

### โครงสร้างโค้ดฝั่งแอป

| ไฟล์ | หน้าที่ |
|---|---|
| `src/lib/supabase/server.ts` | ตัวเชื่อมฝั่งเซิร์ฟเวอร์ เคารพ RLS ตามสิทธิ์ผู้ใช้ที่ล็อกอิน |
| `src/lib/supabase/client.ts` | ตัวเชื่อมฝั่งเบราว์เซอร์ |
| `src/lib/supabase/admin.ts` | ข้าม RLS — **ใช้ที่เดียวคือการบันทึกฟอร์มแจ้งงาน** |
| `src/lib/events.ts` | จุดเดียวที่ตัดสินใจว่าจะดึงจาก Supabase หรือ sample data |
| `src/lib/auth.ts` | ตรวจสิทธิ์แอดมิน (`requireAdmin`) — ป้องกันชั้นที่หนึ่ง |
| `src/proxy.ts` | ต่ออายุ session cookie (Next.js 16 ใช้ชื่อ proxy แทน middleware) |

### สิ่งที่ต้องระวัง

- **ชื่อคอลัมน์ต่างกัน** — DB ใช้ `snake_case` แต่ TypeScript ใช้ `camelCase`
  แปลงที่ฟังก์ชัน `toEvent()` ใน `src/lib/events.ts` ที่เดียว
- **ชื่อจังหวัด/หมวดหมู่ไม่ได้ join มาจาก DB** แต่ประกอบจากค่าคงที่ในแอป
  (`src/lib/data/provinces.ts` และ `categories.ts` ซึ่งเป็นคู่แฝดกับ SQL seed อยู่แล้ว)
  ทำให้ query เบากว่าและได้ค่าตรงกับที่ UI ใช้เสมอ
- **`lat` / `lng` เป็น nullable** — งานที่ยังไม่มีพิกัดใช้พิกัดจังหวัดแทน
- **อย่าเอา `SUPABASE_SERVICE_ROLE_KEY` ไปใช้ฝั่ง client เด็ดขาด** — คีย์นี้ข้าม RLS ได้ทั้งหมด
  ใช้ได้เฉพาะใน Server Action หรือ API route เท่านั้น และห้ามตั้งชื่อขึ้นต้นด้วย `NEXT_PUBLIC_`

### ทำไมฟอร์มแจ้งงานต้องใช้ service role

ฟอร์มแจ้งงานเปิดให้ส่งได้โดยไม่ต้องล็อกอิน ทางเลือกที่ดูตรงไปตรงมาคือเปิด RLS policy
ให้ `anon` insert เข้าตาราง `events` ได้ **แต่วิธีนั้นมีช่องโหว่**

`anon key` เป็นค่าสาธารณะที่อ่านได้จาก JavaScript ในเบราว์เซอร์อยู่แล้ว พอเปิดสิทธิ์ insert
ให้ anon แปลว่าใครก็ยิงตรงเข้า REST API ของ Supabase ได้ **โดยไม่ผ่าน Server Action ของเรา**
→ validation ทั้งหมด (ความยาวข้อความ, รูปแบบลิงก์, วันที่) ถูกข้ามทิ้ง เปิดทางให้ยัดข้อความ
ยาวไม่จำกัด ใส่ลิงก์อันตรายที่หน้าแอดมินจะ render ให้กด หรือสแปมจนเต็มโควตา

จึงปิด anon insert ทิ้ง (`0003_harden_submissions.sql`) แล้วให้บันทึกผ่าน
`src/lib/supabase/admin.ts` ทางเดียว ซึ่งบังคับให้ทุก request ผ่าน validation ก่อนเสมอ

**กติกาการใช้ `admin.ts`:** ใช้เฉพาะจุดนี้จุดเดียว งานอื่นทั้งหมดใช้ `server.ts` ที่เคารพ RLS
เพราะเมื่อข้าม RLS แล้ว บั๊กในโค้ดจะไม่มีอะไรคอยกันอีกชั้น
