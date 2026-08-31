-- Phikadfest — ปิดช่องโหว่ฟอร์มแจ้งงาน และแก้ events_nearby ให้คืนคอลัมน์ครบ
--
-- ไฟล์นี้เขียนแบบ idempotent (รันซ้ำได้ไม่พัง) เพราะต้องใช้ได้ทั้งกับ
-- ฐานข้อมูลที่รัน 0001 เวอร์ชันเก่าไปแล้ว และเครื่องที่ติดตั้งใหม่
--
-- รันบน Supabase: SQL Editor → วางไฟล์นี้ → Run


-- ---------------------------------------------------------------------------
-- 1. ปิดไม่ให้ anon เขียนเข้าตาราง events โดยตรง
-- ---------------------------------------------------------------------------
--
-- anon key เป็นค่าสาธารณะที่อ่านได้จาก JavaScript ในเบราว์เซอร์
-- ถ้าเปิดสิทธิ์ insert ให้ anon แปลว่าใครก็ยิงตรงเข้า REST API ได้โดยไม่ผ่านโค้ดของเรา
-- ทำให้ validation ฝั่งเซิร์ฟเวอร์ทั้งหมดถูกข้ามทิ้ง
--
-- ฟอร์มแจ้งงานสาธารณะเปลี่ยนไปบันทึกผ่าน service role key ฝั่งเซิร์ฟเวอร์แทน
-- ซึ่งข้าม RLS อยู่แล้ว จึงยังทำงานได้ตามปกติหลังรันไฟล์นี้

drop policy if exists "anyone can submit events for review" on events;


-- ---------------------------------------------------------------------------
-- 2. จำกัดความยาวข้อความ — ป้องกันชั้นที่สอง
-- ---------------------------------------------------------------------------
--
-- ถึงตอนนี้จะไม่มีใคร insert ตรงได้แล้ว แต่ใส่ไว้กันวันหน้าเผลอเปิดสิทธิ์อีก
-- และกันบั๊กฝั่งแอปที่อาจลืม validate
-- ค่าที่ตั้งสอดคล้องกับที่ตรวจใน src/app/(site)/submit/actions.ts

alter table events drop constraint if exists events_title_length;
alter table events add constraint events_title_length
  check (char_length(title) between 5 and 200);

alter table events drop constraint if exists events_description_length;
alter table events add constraint events_description_length
  check (description is null or char_length(description) <= 5000);


-- ---------------------------------------------------------------------------
-- 3. อัปเดต events_nearby ให้คืนคอลัมน์ครบ
-- ---------------------------------------------------------------------------
--
-- เวอร์ชันเดิมคืนแค่คอลัมน์ที่พอแสดงการ์ด แต่ฝั่งแอปต้องใช้ province_id / category_id
-- เพื่อประกอบชื่อจังหวัดและหมวดหมู่จากค่าคงที่ในแอป และต้องใช้ price_min/max แสดงราคา
-- ถ้าไม่มีคอลัมน์เหล่านี้ toEvent() จะทิ้งทุกแถว ทำให้ "งานใกล้ฉัน" คืนค่าว่างเสมอ
--
-- ต้อง drop ก่อนเพราะ create or replace เปลี่ยน return type ของฟังก์ชันไม่ได้

drop function if exists events_nearby(double precision, double precision, integer, integer, smallint);

create function events_nearby(
  p_lat        double precision,
  p_lng        double precision,
  p_radius_m   integer default 100000,   -- ค่าตั้งต้น 100 กม.
  p_limit      integer default 50,
  p_category   smallint default null
)
returns table (
  id              uuid,
  slug            text,
  title           text,
  description     text,
  category_id     smallint,
  province_id     smallint,
  district        text,
  venue_name      text,
  address         text,
  lat             double precision,
  lng             double precision,
  start_at        timestamptz,
  end_at          timestamptz,
  is_all_day      boolean,
  cover_image_url text,
  ticket_url      text,
  is_free         boolean,
  price_min       integer,
  price_max       integer,
  organizer_name  text,
  source_url      text,
  distance_m      double precision
)
language sql
stable
as $$
  select
    e.id,
    e.slug,
    e.title,
    e.description,
    e.category_id,
    e.province_id,
    e.district,
    e.venue_name,
    e.address,
    e.lat,
    e.lng,
    e.start_at,
    e.end_at,
    e.is_all_day,
    e.cover_image_url,
    e.ticket_url,
    e.is_free,
    e.price_min,
    e.price_max,
    e.organizer_name,
    e.source_url,
    st_distance(e.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as distance_m
  from events e
  where e.status = 'approved'
    and e.end_at >= now()
    and e.location is not null
    and st_dwithin(
          e.location,
          st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography,
          p_radius_m
        )
    and (p_category is null or e.category_id = p_category)
  order by distance_m asc
  limit p_limit;
$$;
