-- Phikadfest — schema เริ่มต้น
-- รันบน Supabase: SQL Editor → วางไฟล์นี้ → Run
-- หรือผ่าน Supabase CLI: supabase db push

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

-- postgis: ใช้คำนวณระยะทางจริงสำหรับฟีเจอร์ "งานใกล้ฉัน"
create extension if not exists postgis;

-- pg_trgm: ใช้ค้นหาข้อความภาษาไทย (full-text search ตัดคำไทยไม่ได้ เพราะไทยไม่มีช่องว่างระหว่างคำ)
create extension if not exists pg_trgm;


-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type region as enum ('north', 'northeast', 'central', 'east', 'west', 'south');

create type event_status as enum ('draft', 'pending', 'approved', 'rejected', 'archived');

create type user_role as enum ('user', 'organizer', 'admin');


-- ---------------------------------------------------------------------------
-- ตารางอ้างอิง (reference tables)
-- ---------------------------------------------------------------------------

-- 77 จังหวัด — seed ใน 0002_seed_reference.sql
-- lat/lng เป็นจุดกึ่งกลางจังหวัดโดยประมาณ ใช้เป็น fallback เมื่องานไม่มีพิกัดของตัวเอง
create table provinces (
  id          smallserial primary key,
  code        text        not null unique,     -- ISO 3166-2:TH เช่น 'TH-50'
  slug        text        not null unique,     -- ใช้ใน URL เช่น 'chiang-mai'
  name_th     text        not null,
  name_en     text        not null,
  region      region      not null,
  lat         double precision not null,
  lng         double precision not null
);

-- หมวดหมู่งาน — แยกเป็นตารางแทน enum เพื่อให้เพิ่มหมวดใหม่ได้โดยไม่ต้อง migrate
create table categories (
  id           smallserial primary key,
  slug         text        not null unique,     -- 'music', 'car-meet', ...
  name_th      text        not null,
  name_en      text        not null,
  emoji        text,
  sort_order   smallint    not null default 0,
  -- สี accent (hex) ใช้ทำภาพประกอบการ์ดงานและ badge ในหน้าเว็บ — คู่แฝดกับ CATEGORIES ใน src/lib/data/categories.ts
  accent_color text        not null default '#78716c'
);


-- ---------------------------------------------------------------------------
-- ผู้ใช้
-- ---------------------------------------------------------------------------

-- ขยายจาก auth.users ของ Supabase เพื่อเก็บ role และชื่อที่แสดง
create table profiles (
  id            uuid      primary key references auth.users(id) on delete cascade,
  display_name  text,
  role          user_role not null default 'user',
  created_at    timestamptz not null default now()
);


-- ---------------------------------------------------------------------------
-- อีเวนต์ (ตารางหลัก)
-- ---------------------------------------------------------------------------

create table events (
  id            uuid          primary key default gen_random_uuid(),
  slug          text          not null unique,   -- URL ที่อ่านออก ดีต่อ SEO
  title         text          not null,
  description   text,

  category_id   smallint      not null references categories(id),

  -- สถานที่
  province_id   smallint      not null references provinces(id),
  district      text,
  venue_name    text,
  address       text,
  lat           double precision,
  lng           double precision,
  -- คอลัมน์ generated: สร้างจาก lat/lng อัตโนมัติ ไม่ต้องเขียนเอง
  -- หมายเหตุ ST_MakePoint รับ (lng, lat) สลับกับที่คนคุ้นเคย
  location      geography(Point, 4326) generated always as (
                  case
                    when lat is not null and lng is not null
                    then st_setsrid(st_makepoint(lng, lat), 4326)::geography
                  end
                ) stored,

  -- เวลา
  start_at      timestamptz   not null,
  end_at        timestamptz   not null,
  -- งานเทศกาลหลายงานประกาศแค่ "วันที่" ไม่ประกาศเวลาเริ่ม จึงต้องแยกกรณีนี้ไว้
  is_all_day    boolean       not null default false,

  -- เนื้อหา
  cover_image_url text,
  ticket_url      text,
  is_free         boolean     not null default true,
  price_min       integer,
  price_max       integer,

  -- ที่มา
  organizer_name    text,
  organizer_contact text,
  source_url        text,

  -- moderation
  status        event_status  not null default 'pending',
  submitted_by  uuid          references auth.users(id) on delete set null,
  reviewed_by   uuid          references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,

  -- งานประจำปีที่จัดซ้ำทุกปี: แต่ละครั้งเป็นหนึ่งแถว ผูกกันด้วย series_id
  -- เลือกแบบนี้แทนการเก็บกฎ recurrence เพราะงานไทยมักเลื่อนวันตามปฏิทินจันทรคติ
  -- กฎตายตัวจึงใช้ไม่ได้จริง
  series_id     uuid,

  view_count    integer       not null default 0,
  created_at    timestamptz   not null default now(),
  updated_at    timestamptz   not null default now(),

  constraint events_end_after_start check (end_at >= start_at),
  constraint events_price_range      check (price_max is null or price_min is null or price_max >= price_min)
);

-- แท็กแบบยืดหยุ่น (หมวดหมู่มีได้หมวดเดียว แต่แท็กมีได้หลายอัน)
create table tags (
  id      smallserial primary key,
  slug    text not null unique,
  name_th text not null
);

create table event_tags (
  event_id uuid     not null references events(id) on delete cascade,
  tag_id   smallint not null references tags(id) on delete cascade,
  primary key (event_id, tag_id)
);

-- Phase 2: ผู้ใช้บันทึกงานที่สนใจ
create table bookmarks (
  user_id    uuid not null references auth.users(id) on delete cascade,
  event_id   uuid not null references events(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, event_id)
);


-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

-- query หลัก: "งานที่อนุมัติแล้ว ยังไม่จบ เรียงตามวันเริ่ม"
create index events_status_start_idx on events (status, start_at);
create index events_status_end_idx   on events (status, end_at);

-- กรองตามจังหวัด/หมวดหมู่
create index events_province_idx on events (province_id);
create index events_category_idx on events (category_id);

-- "งานใกล้ฉัน" — GIST index ทำให้ ST_DWithin ไม่ต้องสแกนทั้งตาราง
create index events_location_idx on events using gist (location);

-- ค้นหาข้อความไทย
create index events_title_trgm_idx on events using gin (title gin_trgm_ops);

create index events_submitted_by_idx on events (submitted_by);
create index bookmarks_event_idx     on bookmarks (event_id);


-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger events_set_updated_at
  before update on events
  for each row
  execute function set_updated_at();


-- สร้าง profile อัตโนมัติเมื่อมีผู้ใช้ใหม่สมัคร
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row
  execute function handle_new_user();


-- ---------------------------------------------------------------------------
-- ฟังก์ชัน "งานใกล้ฉัน"
-- ---------------------------------------------------------------------------

-- เรียกจากฝั่งแอปด้วย supabase.rpc('events_nearby', { ... })
-- ทำเป็นฟังก์ชันเพราะ Supabase client ยิง PostGIS operator ตรงๆ ไม่ได้
create or replace function events_nearby(
  p_lat        double precision,
  p_lng        double precision,
  p_radius_m   integer default 100000,   -- ค่าตั้งต้น 100 กม.
  p_limit      integer default 50,
  p_category   smallint default null
)
returns table (
  id            uuid,
  slug          text,
  title         text,
  start_at      timestamptz,
  end_at        timestamptz,
  is_all_day    boolean,
  venue_name    text,
  district      text,
  province_name text,
  category_slug text,
  cover_image_url text,
  is_free       boolean,
  distance_m    double precision
)
language sql
stable
as $$
  select
    e.id,
    e.slug,
    e.title,
    e.start_at,
    e.end_at,
    e.is_all_day,
    e.venue_name,
    e.district,
    p.name_th as province_name,
    c.slug    as category_slug,
    e.cover_image_url,
    e.is_free,
    st_distance(e.location, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography) as distance_m
  from events e
  join provinces  p on p.id = e.province_id
  join categories c on c.id = e.category_id
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


-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table events     enable row level security;
alter table profiles   enable row level security;
alter table bookmarks  enable row level security;
alter table event_tags enable row level security;

-- ตารางอ้างอิงเปิดให้อ่านได้ทุกคน แก้ไม่ได้
alter table provinces  enable row level security;
alter table categories enable row level security;
alter table tags       enable row level security;

create policy "provinces readable by everyone"  on provinces  for select using (true);
create policy "categories readable by everyone" on categories for select using (true);
create policy "tags readable by everyone"       on tags       for select using (true);
create policy "event_tags readable by everyone" on event_tags for select using (true);

-- helper: ผู้ใช้ปัจจุบันเป็นแอดมินหรือไม่
create or replace function is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

-- คนทั่วไปเห็นเฉพาะงานที่อนุมัติแล้ว
create policy "approved events are public"
  on events for select
  using (status = 'approved');

-- ผู้ส่งงานเห็นงานของตัวเองทุกสถานะ (ไว้ดูว่าอนุมัติหรือยัง)
create policy "submitters see their own events"
  on events for select
  to authenticated
  using (submitted_by = auth.uid());

-- แอดมินเห็นและจัดการได้ทุกอย่าง
create policy "admins manage all events"
  on events for all
  to authenticated
  using (is_admin())
  with check (is_admin());

-- ผู้ใช้ที่ล็อกอินส่งงานได้ แต่บังคับให้เข้าคิวรออนุมัติเสมอ
-- (ไม่ให้ตั้ง status เป็น approved เองได้)
create policy "authenticated users submit events"
  on events for insert
  to authenticated
  with check (submitted_by = auth.uid() and status = 'pending');

create policy "users read own profile"
  on profiles for select
  to authenticated
  using (id = auth.uid() or is_admin());

create policy "users update own profile"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));

create policy "users manage own bookmarks"
  on bookmarks for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
