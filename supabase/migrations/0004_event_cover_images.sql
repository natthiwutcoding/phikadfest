-- Phikadfest — ที่เก็บรูปปกงาน
--
-- ไฟล์นี้เขียนแบบ idempotent (รันซ้ำได้ไม่พัง)
-- รันบน Supabase: SQL Editor → วางไฟล์นี้ → Run
--
-- คอลัมน์ events.cover_image_url มีอยู่แล้วตั้งแต่ 0001_init.sql ไฟล์นี้จึงเพิ่มแค่
-- "ที่เก็บไฟล์" ไม่ต้องแก้โครงสร้างตาราง


-- ---------------------------------------------------------------------------
-- 1. สร้าง bucket สำหรับรูปปกงาน
-- ---------------------------------------------------------------------------
--
-- public = true เพราะรูปต้องแสดงบนหน้าเว็บสาธารณะและถูก Google เก็บ index
-- ถ้าเป็น private ต้องสร้าง signed URL ที่มีวันหมดอายุทุกครั้งที่ render
-- ซึ่งทำให้ cache ไม่ได้และหน้าเว็บช้าลงโดยไม่ได้ความปลอดภัยเพิ่ม —
-- เนื้อหาในนั้นตั้งใจให้ทุกคนเห็นอยู่แล้ว
--
-- file_size_limit / allowed_mime_types เป็นด่านสุดท้ายที่ระดับ Storage
-- ตรงกับที่ตรวจไว้ใน src/app/(site)/submit/actions.ts (ป้องกันสองชั้นแบบเดียวกับ
-- ที่ 0003 ทำกับความยาวข้อความ)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-covers',
  'event-covers',
  true,
  5242880,                                            -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;


-- ---------------------------------------------------------------------------
-- 2. ใครอ่านได้บ้าง
-- ---------------------------------------------------------------------------
--
-- อ่านได้ทุกคนโดยไม่ต้องล็อกอิน เพราะรูปแสดงบนหน้าสาธารณะ

drop policy if exists "event covers are publicly readable" on storage.objects;

create policy "event covers are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'event-covers');


-- ---------------------------------------------------------------------------
-- 3. ใครเขียนได้บ้าง — ตั้งใจไม่สร้าง policy ใดๆ
-- ---------------------------------------------------------------------------
--
-- ไม่มี policy อนุญาต insert/update/delete แปลว่า anon และผู้ใช้ที่ล็อกอินแล้ว
-- อัปโหลดตรงเข้า Storage API ไม่ได้เลย
--
-- ทางเดียวที่อัปโหลดได้คือผ่าน service role key ฝั่งเซิร์ฟเวอร์ (ข้าม RLS)
-- ซึ่งบังคับให้ทุกไฟล์ต้องผ่าน validation ใน Server Action ก่อนเสมอ
-- — หลักการเดียวกับที่ 0003 ใช้กับตาราง events
--
-- ถ้าวันหน้าต้องการให้ผู้จัดงานที่ล็อกอินอัปโหลดเองได้ (Phase 2) ค่อยเพิ่ม policy
-- ที่ผูกกับ auth.uid() ตรงนี้
