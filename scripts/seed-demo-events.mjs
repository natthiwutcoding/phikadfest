/**
 * ใส่ข้อมูลงานตัวอย่างลงฐานข้อมูล เพื่อดูหน้าเว็บตอนยังไม่มีข้อมูลจริง
 *
 *   node scripts/seed-demo-events.mjs          ใส่ข้อมูล
 *   node scripts/seed-demo-events.mjs --clean  ลบเฉพาะข้อมูลที่สคริปต์นี้ใส่
 *
 * ⚠️ ห้ามรันกับฐานข้อมูล production
 * ชื่องานเป็นงานที่มีอยู่จริง แต่ "วันเวลา สถานที่ ราคา และผู้จัด" เป็นค่าสมมติทั้งหมด
 * ต้องแทนที่ด้วยข้อมูลที่ตรวจสอบแล้วก่อนเปิดใช้จริง
 *
 * ทุกแถวถูกประทับ review_note = 'demo-seed' ไว้ (คอลัมน์นี้ไม่มีหน้าไหนอ่าน จึงใช้เป็น
 * เครื่องหมายภายในได้ปลอดภัย) ทำให้ --clean ลบเฉพาะข้อมูลตัวอย่างโดยไม่แตะงานจริง
 *
 * ── ทำไมยิงผ่าน REST ด้วย service role แทนการเขียน SQL ──
 * ใช้กติกาเดียวกับที่แอปใช้เขียนข้อมูล (ดู src/lib/supabase/admin.ts) จึงมั่นใจได้ว่า
 * ข้อมูลที่ใส่ผ่าน constraint และ trigger ชุดเดียวกับที่ผู้ใช้จริงจะเจอ
 * และเลี่ยงปัญหา encoding ภาษาไทยเพี้ยนตอนส่ง SQL ผ่าน shell บน Windows
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/** เครื่องหมายประจำข้อมูลตัวอย่าง — ใช้ทั้งตอนใส่และตอนลบ */
const DEMO_MARK = "demo-seed";

// ---------------------------------------------------------------------------
// อ่านค่าเชื่อมต่อจาก .env.local
// ---------------------------------------------------------------------------

function readEnv(key) {
  const file = readFileSync(join(ROOT, ".env.local"), "utf8");
  const match = new RegExp(`^${key}=(.*)$`, "m").exec(file);
  if (!match) throw new Error(`ไม่พบ ${key} ใน .env.local`);
  return match[1].trim().replace(/^["']|["']$/g, "");
}

const SUPABASE_URL = readEnv("NEXT_PUBLIC_SUPABASE_URL");
const SERVICE_ROLE_KEY = readEnv("SUPABASE_SERVICE_ROLE_KEY");

const headers = {
  apikey: SERVICE_ROLE_KEY,
  Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
};

async function rest(path, init = {}) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers, ...init });
  if (!response.ok) {
    throw new Error(`${init.method ?? "GET"} ${path} → ${response.status}\n${await response.text()}`);
  }
  // PostgREST ตอบ 201 พร้อม body ว่างเมื่อ insert สำเร็จ (ค่าตั้งต้นคือ return=minimal)
  // จึงต้องดูเนื้อจริงก่อน ไม่ใช่เช็คแค่ status 204
  const body = await response.text();
  return body ? JSON.parse(body) : null;
}

// ---------------------------------------------------------------------------
// วันเวลา
// ---------------------------------------------------------------------------

/**
 * แปลง "อีกกี่วัน" เป็นเวลาแบบเต็มรูปแบบ ตรึงโซนเวลาไทยไว้ที่ +07:00
 *
 * ตรึงไว้ตายตัวด้วยเหตุผลเดียวกับ src/lib/format.ts — ถ้าปล่อยให้ใช้โซนเวลาของเครื่อง
 * ที่รันสคริปต์ วันของงานจะเพี้ยนเมื่อรันจากเครื่องที่ตั้งโซนเวลาอื่น
 */
function at(daysFromNow, hour) {
  const date = new Date(Date.now() + daysFromNow * 86_400_000);
  const day = date.toISOString().slice(0, 10);
  return `${day}T${String(hour).padStart(2, "0")}:00:00+07:00`;
}

// ---------------------------------------------------------------------------
// ข้อมูลงานตัวอย่าง
// ---------------------------------------------------------------------------

/**
 * แต่ละแถว: จังหวัด หมวดหมู่ ชื่องาน สถานที่ พิกัด และช่วงวัน
 *
 * `in` = เริ่มอีกกี่วันนับจากวันที่รันสคริปต์ — ใช้ค่าสัมพัทธ์แทนวันที่ตายตัว
 * เพื่อให้ข้อมูลไม่หมดอายุกลายเป็นงานที่ผ่านไปแล้วเมื่อรันอีกหลายเดือนถัดมา
 *
 * กระจายค่า `in` ให้มีทั้งงานใน 7 วัน ใน 1 เดือน และไกลกว่านั้น เพื่อให้เห็นผลของ
 * ตัวกรองช่วงเวลาบนหน้าเว็บ และจงใจวางงานหลายรายการไว้ใกล้กันในพัทยา
 * เพื่อให้เห็นการจัดกลุ่มหมุดบนแผนที่
 *
 * ครอบคลุมเฉพาะ 7 จังหวัดภาคตะวันออกตาม ACTIVE_REGION ใน src/lib/region-scope.ts
 * ถ้าขยายขอบเขตไปภาคอื่นแล้วยังอยากมีข้อมูลตัวอย่าง ต้องมาเพิ่มงานของภาคนั้นที่นี่ด้วย
 */
const EVENTS = [
  // ── ชลบุรี ────────────────────────────────────────────────────────────────
  { province: "chonburi", category: "culture", slug: "chonburi-buffalo-race",
    title: "ประเพณีวิ่งควาย ชลบุรี", venue: "สนามหน้าศาลากลางจังหวัดชลบุรี", district: "เมืองชลบุรี",
    lat: 13.3611, lng: 100.9847, in: 36, days: 2, allDay: true, free: true,
    organizer: "จังหวัดชลบุรี",
    description: "ประเพณีเก่าแก่กว่าร้อยปีของชาวชลบุรี มีการแข่งวิ่งควาย ประกวดควายงาม และขบวนแห่เกวียน" },

  { province: "chonburi", category: "annual-fair", slug: "phra-phuttha-sihing-fair",
    title: "งานนมัสการพระพุทธสิหิงค์ฯ และงานประจำปีจังหวัดชลบุรี", venue: "สนามหน้าศาลากลางจังหวัดชลบุรี", district: "เมืองชลบุรี",
    lat: 13.362, lng: 100.984, in: 96, days: 9, allDay: true, free: true,
    organizer: "จังหวัดชลบุรี",
    description: "งานวัดประจำปีที่ใหญ่ที่สุดของจังหวัด มีร้านค้า เครื่องเล่น และมหรสพตลอดคืน" },

  { province: "chonburi", category: "music", slug: "pattaya-music-festival",
    title: "เทศกาลดนตรีพัทยา", venue: "ชายหาดพัทยากลาง", district: "บางละมุง",
    lat: 12.9236, lng: 100.8825, in: 50, days: 3, free: true, startHour: 16, endHour: 24,
    organizer: "เมืองพัทยา",
    description: "เวทีดนตรีริมหาดหลายเวทีตลอดสามคืน ตั้งแต่ป็อปไทยจนถึงร็อกและอิเล็กทรอนิกส์" },

  { province: "chonburi", category: "culture", slug: "pattaya-fireworks-festival",
    title: "เทศกาลพลุนานาชาติพัทยา", venue: "ชายหาดพัทยาใต้", district: "บางละมุง",
    lat: 12.9276, lng: 100.8776, in: 53, days: 2, free: true, startHour: 18, endHour: 22,
    organizer: "เมืองพัทยา",
    description: "การแข่งขันจุดพลุจากทีมนานาชาติ ชมได้ตลอดแนวชายหาดโดยไม่มีค่าเข้า" },

  { province: "chonburi", category: "sport", slug: "pattaya-marathon",
    title: "พัทยามาราธอน", venue: "ถนนเลียบชายหาดพัทยา", district: "บางละมุง",
    lat: 12.93, lng: 100.883, in: 58, days: 0, free: false, priceMin: 600, priceMax: 1800,
    startHour: 3, endHour: 10, organizer: "เมืองพัทยา",
    description: "วิ่งเส้นทางเลียบทะเลตั้งแต่ก่อนฟ้าสาง มีระยะ 10 กม. ฮาล์ฟ และฟูลมาราธอน" },

  { province: "chonburi", category: "music", slug: "pattaya-countdown",
    title: "พัทยาเคาต์ดาวน์", venue: "ลานโพธิ์ นาเกลือ", district: "บางละมุง",
    lat: 12.927, lng: 100.877, in: 121, days: 1, free: true, startHour: 18, endHour: 24,
    organizer: "เมืองพัทยา",
    description: "งานส่งท้ายปีริมทะเล มีคอนเสิร์ตและการนับถอยหลังพร้อมพลุกลางอ่าว" },

  { province: "chonburi", category: "car-meet", slug: "bangsaen-car-meet",
    title: "คาร์มีทบางแสน", venue: "ลานจอดรถแหลมแท่น", district: "เมืองชลบุรี",
    lat: 13.2846, lng: 100.9169, in: 13, days: 0, free: true, startHour: 17, endHour: 22,
    organizer: "ชมรมรถบางแสน",
    description: "รวมรถซิ่งและรถแต่งริมทะเล พร้อมซุ้มอาหารทะเลตลอดแนวลาน" },

  { province: "chonburi", category: "sport", slug: "bangsaen-half-marathon",
    title: "บางแสนฮาล์ฟมาราธอน", venue: "ชายหาดบางแสน", district: "เมืองชลบุรี",
    lat: 13.28, lng: 100.92, in: 44, days: 0, free: false, priceMin: 700, priceMax: 1500,
    startHour: 4, endHour: 9, organizer: "เทศบาลเมืองแสนสุข",
    description: "งานวิ่งริมหาดบางแสน เส้นทางราบตลอดสาย วิ่งรับลมทะเลตั้งแต่เช้ามืด" },

  { province: "chonburi", category: "food", slug: "nong-mon-market-fair",
    title: "เทศกาลของฝากตลาดหนองมน", venue: "ตลาดหนองมน", district: "เมืองชลบุรี",
    lat: 13.305, lng: 100.925, in: 4, days: 4, free: true, startHour: 9, endHour: 20,
    organizer: "เทศบาลเมืองแสนสุข",
    description: "รวมของฝากขึ้นชื่อของชลบุรี ทั้งข้าวหลาม กุนเชียง และอาหารทะเลแปรรูป" },

  { province: "chonburi", category: "food", slug: "sriracha-seafood-fest",
    title: "เทศกาลอาหารทะเลศรีราชา", venue: "เกาะลอยศรีราชา", district: "ศรีราชา",
    lat: 13.174, lng: 100.93, in: 22, days: 4, free: true, startHour: 11, endHour: 22,
    organizer: "เทศบาลเมืองศรีราชา",
    description: "ร้านอาหารทะเลจากชุมชนประมงพื้นบ้าน พร้อมการสาธิตแปรรูปและตลาดของทะเลสด" },

  { province: "chonburi", category: "culture", slug: "kong-khao-sriracha",
    title: "ประเพณีกองข้าวศรีราชา", venue: "ลานหน้าเทศบาลเมืองศรีราชา", district: "ศรีราชา",
    lat: 13.175, lng: 100.929, in: 74, days: 3, allDay: true, free: true,
    organizer: "เทศบาลเมืองศรีราชา",
    description: "ประเพณีบวงสรวงและเลี้ยงผีที่สืบทอดกันมาในชุมชนศรีราชา พร้อมการละเล่นพื้นบ้าน" },

  { province: "chonburi", category: "workshop", slug: "phanat-nikhom-basketry",
    title: "เวิร์กช็อปจักสานพนัสนิคม", venue: "ศูนย์หัตถกรรมพื้นบ้านพนัสนิคม", district: "พนัสนิคม",
    lat: 13.46, lng: 101.18, in: 9, days: 0, free: false, priceMin: 500,
    startHour: 9, endHour: 16, organizer: "กลุ่มหัตถกรรมพนัสนิคม",
    description: "เรียนสานไม้ไผ่กับช่างท้องถิ่นที่ทำมาทั้งชีวิต ได้ชิ้นงานกลับบ้านหนึ่งชิ้น รับรอบละ 15 คน" },

  // ── ระยอง ─────────────────────────────────────────────────────────────────
  { province: "rayong", category: "food", slug: "rayong-seafood-fest",
    title: "เทศกาลอาหารทะเลระยอง", venue: "สวนศรีเมือง", district: "เมืองระยอง",
    lat: 12.6814, lng: 101.2816, in: 29, days: 4, free: true, startHour: 11, endHour: 22,
    organizer: "จังหวัดระยอง",
    description: "ร้านอาหารทะเลจากชุมชนประมงพื้นบ้าน พร้อมการสาธิตแปรรูปอาหารทะเล" },

  { province: "rayong", category: "food", slug: "rayong-fruit-fair",
    title: "งานเทศกาลผลไม้และของดีเมืองระยอง", venue: "สนามกีฬากลางจังหวัดระยอง", district: "เมืองระยอง",
    lat: 12.68, lng: 101.25, in: 67, days: 5, allDay: true, free: true,
    organizer: "จังหวัดระยอง",
    description: "ประกวดทุเรียน มังคุด และเงาะ พร้อมตลาดผลไม้จากสวนโดยตรงตลอดงาน" },

  { province: "rayong", category: "culture", slug: "rayong-floating-robe",
    title: "ประเพณีทอดผ้าป่ากลางน้ำ ปากน้ำประแส", venue: "ปากน้ำประแส", district: "แกลง",
    lat: 12.66, lng: 101.27, in: 38, days: 2, allDay: true, free: true,
    organizer: "เทศบาลตำบลปากน้ำประแส",
    description: "ขบวนเรือประมงแห่ผ้าป่ากลางลำน้ำประแส เป็นประเพณีของชุมชนชาวประมงที่หาดูได้ยาก" },

  { province: "rayong", category: "car-meet", slug: "map-ta-phut-car-meet",
    title: "คาร์มีทมาบตาพุด", venue: "ลานจอดรถศูนย์ราชการมาบตาพุด", district: "เมืองระยอง",
    lat: 12.69, lng: 101.15, in: 17, days: 0, free: true, startHour: 17, endHour: 23,
    organizer: "กลุ่มรถซิ่งระยอง",
    description: "รวมรถแต่งสายญี่ปุ่นและยุโรปจากภาคตะวันออก มีโซนเครื่องเสียงและซุ้มอาหาร" },

  { province: "rayong", category: "sport", slug: "samet-beach-run",
    title: "เกาะเสม็ดบีชรัน", venue: "หาดทรายแก้ว เกาะเสม็ด", district: "เมืองระยอง",
    lat: 12.57, lng: 101.45, in: 62, days: 0, free: false, priceMin: 800, priceMax: 1200,
    startHour: 5, endHour: 9, organizer: "อุทยานแห่งชาติเขาแหลมหญ้า-หมู่เกาะเสม็ด",
    description: "วิ่งบนหาดทรายขาวรอบเกาะเสม็ดตอนพระอาทิตย์ขึ้น จำกัดจำนวนผู้เข้าร่วม" },

  { province: "rayong", category: "art", slug: "sunthorn-phu-day",
    title: "งานวันสุนทรภู่", venue: "อนุสาวรีย์สุนทรภู่", district: "แกลง",
    lat: 12.73, lng: 101.43, in: 88, days: 2, allDay: true, free: true,
    organizer: "จังหวัดระยอง",
    description: "นิทรรศการวรรณคดี การแสดงละครจากเรื่องพระอภัยมณี และการประกวดกลอนสด" },

  { province: "rayong", category: "music", slug: "mae-ramphueng-beach-music",
    title: "เทศกาลดนตรีชายหาดแม่รำพึง", venue: "ชายหาดแม่รำพึง", district: "เมืองระยอง",
    lat: 12.63, lng: 101.32, in: 25, days: 2, free: true, startHour: 17, endHour: 23,
    organizer: "เทศบาลตำบลเพ",
    description: "เวทีดนตรีริมหาดสองคืน รวมวงท้องถิ่นภาคตะวันออกและศิลปินรับเชิญ" },

  // ── จันทบุรี ──────────────────────────────────────────────────────────────
  { province: "chanthaburi", category: "food", slug: "chanthaburi-fruit-fair",
    title: "เทศกาลผลไม้จันทบุรี", venue: "ลานหน้าศาลากลางจังหวัดจันทบุรี", district: "เมืองจันทบุรี",
    lat: 12.6113, lng: 102.1039, in: 70, days: 7, allDay: true, free: true,
    organizer: "จังหวัดจันทบุรี",
    description: "ประกวดทุเรียนและผลไม้ประจำถิ่น พร้อมขบวนรถผลไม้และตลาดจากสวนโดยตรง" },

  { province: "chanthaburi", category: "culture", slug: "chanthaburi-gems-festival",
    title: "เทศกาลอัญมณีและเครื่องประดับจันทบุรี", venue: "ถนนอัญมณี", district: "เมืองจันทบุรี",
    lat: 12.609, lng: 102.105, in: 100, days: 5, free: true, startHour: 9, endHour: 18,
    organizer: "จังหวัดจันทบุรี",
    description: "ตลาดพลอยที่ใหญ่ที่สุดของไทย พร้อมสาธิตการเจียระไนและนิทรรศการอัญมณี" },

  { province: "chanthaburi", category: "workshop", slug: "gem-cutting-workshop",
    title: "เวิร์กช็อปเจียระไนพลอยจันทบูร", venue: "ชุมชนริมน้ำจันทบูร", district: "เมืองจันทบุรี",
    lat: 12.6095, lng: 102.1045, in: 11, days: 0, free: false, priceMin: 900,
    startHour: 10, endHour: 16, organizer: "ชุมชนริมน้ำจันทบูร",
    description: "เรียนพื้นฐานการเจียระไนพลอยกับช่างในย่านเก่า ได้พลอยที่เจียระไนเองกลับบ้าน" },

  { province: "chanthaburi", category: "food", slug: "chanthaboon-riverside-market",
    title: "ตลาดชุมชนริมน้ำจันทบูร", venue: "ชุมชนริมน้ำจันทบูร", district: "เมืองจันทบุรี",
    lat: 12.607, lng: 102.108, in: 2, days: 2, free: true, startHour: 16, endHour: 21,
    organizer: "ชุมชนริมน้ำจันทบูร",
    description: "ตลาดของกินและงานคราฟต์ในย่านบ้านไม้เก่าอายุร้อยปี เดินได้ยาวตลอดสาย" },

  { province: "chanthaburi", category: "culture", slug: "cathedral-festival-chanthaburi",
    title: "งานสมโภชอาสนวิหารพระนางมารีอาปฏิสนธินิรมล", venue: "อาสนวิหารพระนางมารีอาปฏิสนธินิรมล", district: "เมืองจันทบุรี",
    lat: 12.605, lng: 102.112, in: 108, days: 3, allDay: true, free: true,
    organizer: "อาสนวิหารพระนางมารีอาปฏิสนธินิรมล",
    description: "งานประจำปีของโบสถ์คริสต์ที่ใหญ่ที่สุดในไทย มีตลาดนัดและการแสดงในลานวัด" },

  { province: "chanthaburi", category: "sport", slug: "khao-khitchakut-trail",
    title: "วิ่งเทรลเขาคิชฌกูฏ", venue: "อุทยานแห่งชาติเขาคิชฌกูฏ", district: "เขาคิชฌกูฏ",
    lat: 12.85, lng: 102.13, in: 47, days: 0, free: false, priceMin: 900, priceMax: 1600,
    startHour: 5, endHour: 13, organizer: "อุทยานแห่งชาติเขาคิชฌกูฏ",
    description: "วิ่งเทรลขึ้นเขาผ่านป่าดิบชื้น ระยะ 12 และ 25 กิโลเมตร รับจำนวนจำกัด" },

  { province: "chanthaburi", category: "culture", slug: "chak-phra-bat-chanthaburi",
    title: "ประเพณีชักพระบาทจันทบุรี", venue: "วัดพลับ", district: "เมืองจันทบุรี",
    lat: 12.61, lng: 102.1, in: 31, days: 2, allDay: true, free: true,
    organizer: "จังหวัดจันทบุรี",
    description: "ขบวนแห่รอยพระพุทธบาทจำลองรอบเมือง เป็นประเพณีช่วงออกพรรษาของชาวจันท์" },

  // ── ตราด ──────────────────────────────────────────────────────────────────
  { province: "trat", category: "food", slug: "trat-fruit-fair",
    title: "งานวันผลไม้และของดีเมืองตราด", venue: "สนามหน้าศาลากลางจังหวัดตราด", district: "เมืองตราด",
    lat: 12.2428, lng: 102.5175, in: 72, days: 5, allDay: true, free: true,
    organizer: "จังหวัดตราด",
    description: "ประกวดผลไม้ประจำถิ่น ทั้งทุเรียนชะนีเกาะช้าง สับปะรดตราดสีทอง และเงาะ" },

  { province: "trat", category: "culture", slug: "koh-chang-naval-battle-day",
    title: "งานวันวีรกรรมทหารเรือไทยในยุทธนาวีที่เกาะช้าง", venue: "อนุสรณ์สถานยุทธนาวีที่เกาะช้าง", district: "แหลมงอบ",
    lat: 12.08, lng: 102.34, in: 118, days: 3, allDay: true, free: true,
    organizer: "จังหวัดตราด",
    description: "พิธีรำลึกวีรกรรมทหารเรือ พร้อมนิทรรศการประวัติศาสตร์และงานออกร้านริมทะเล" },

  { province: "trat", category: "food", slug: "koh-chang-seafood-fest",
    title: "เกาะช้างซีฟู้ดเฟสติวัล", venue: "หาดทรายขาว เกาะช้าง", district: "เกาะช้าง",
    lat: 12.05, lng: 102.32, in: 41, days: 3, free: true, startHour: 16, endHour: 23,
    organizer: "เทศบาลตำบลเกาะช้าง",
    description: "ตลาดอาหารทะเลริมหาดพร้อมเวทีดนตรีสด ชมพระอาทิตย์ตกก่อนเริ่มงานได้" },

  { province: "trat", category: "sport", slug: "trat-marathon",
    title: "ตราดมาราธอน", venue: "ศาลากลางจังหวัดตราด", district: "เมืองตราด",
    lat: 12.243, lng: 102.517, in: 91, days: 0, free: false, priceMin: 600, priceMax: 1400,
    startHour: 4, endHour: 11, organizer: "จังหวัดตราด",
    description: "วิ่งเส้นทางผ่านสวนผลไม้และชุมชนริมทะเล มีระยะมินิ ฮาล์ฟ และฟูลมาราธอน" },

  { province: "trat", category: "culture", slug: "bun-klang-ban-trat",
    title: "ประเพณีบุญกลางบ้าน", venue: "ชุมชนบ้านท่าประดู่", district: "เมืองตราด",
    lat: 12.25, lng: 102.51, in: 19, days: 2, allDay: true, free: true,
    organizer: "จังหวัดตราด",
    description: "ประเพณีสะเดาะเคราะห์ประจำหมู่บ้านของชาวตราด มีการทำบุญร่วมกันและตลาดชุมชน" },

  // ── ฉะเชิงเทรา ────────────────────────────────────────────────────────────
  { province: "chachoengsao", category: "annual-fair", slug: "luang-pho-sothon-fair",
    title: "งานนมัสการหลวงพ่อพุทธโสธร", venue: "วัดโสธรวรารามวรวิหาร", district: "เมืองฉะเชิงเทรา",
    lat: 13.687, lng: 101.07, in: 27, days: 9, allDay: true, free: true,
    organizer: "จังหวัดฉะเชิงเทรา",
    description: "งานวัดประจำปีที่ใหญ่ที่สุดของจังหวัด มีขบวนแห่หลวงพ่อโสธรทางน้ำและร้านค้าตลอดริมแม่น้ำ" },

  { province: "chachoengsao", category: "culture", slug: "thong-takhap-parade",
    title: "ประเพณีแห่ธงตะขาบ", venue: "วัดจีนประชาสโมสร", district: "เมืองฉะเชิงเทรา",
    lat: 13.685, lng: 101.068, in: 55, days: 2, allDay: true, free: true,
    organizer: "จังหวัดฉะเชิงเทรา",
    description: "ขบวนแห่ธงตะขาบยาวหลายสิบเมตรตามความเชื่อของชาวรามัญ เป็นประเพณีเฉพาะถิ่น" },

  { province: "chachoengsao", category: "food", slug: "bang-khla-mango-fair",
    title: "เทศกาลมะม่วงบางคล้า", venue: "ที่ว่าการอำเภอบางคล้า", district: "บางคล้า",
    lat: 13.73, lng: 101.21, in: 79, days: 4, allDay: true, free: true,
    organizer: "อำเภอบางคล้า",
    description: "ประกวดมะม่วงน้ำดอกไม้และมะม่วงเขียวเสวย พร้อมตลาดผลไม้จากสวนในพื้นที่" },

  { province: "chachoengsao", category: "food", slug: "bang-khla-floating-market",
    title: "ตลาดน้ำบางคล้า", venue: "ตลาดน้ำบางคล้า", district: "บางคล้า",
    lat: 13.728, lng: 101.213, in: 6, days: 2, free: true, startHour: 8, endHour: 17,
    organizer: "เทศบาลตำบลบางคล้า",
    description: "ตลาดริมแม่น้ำบางปะกง มีอาหารพื้นถิ่นและล่องเรือชมค้างคาวแม่ไก่ในช่วงเย็น" },

  { province: "chachoengsao", category: "sport", slug: "bang-pakong-riverside-run",
    title: "เดิน-วิ่งริมบางปะกง", venue: "สวนสาธารณะริมแม่น้ำบางปะกง", district: "เมืองฉะเชิงเทรา",
    lat: 13.69, lng: 101.075, in: 15, days: 0, free: false, priceMin: 350, priceMax: 700,
    startHour: 5, endHour: 9, organizer: "เทศบาลเมืองฉะเชิงเทรา",
    description: "งานวิ่งระยะ 5 และ 10 กิโลเมตรเลียบแม่น้ำ เส้นทางราบและมีจุดชมวิวตลอดทาง" },

  { province: "chachoengsao", category: "car-meet", slug: "paet-rio-car-meet",
    title: "คาร์มีทแปดริ้ว", venue: "ลานจอดรถโรบินสันฉะเชิงเทรา", district: "เมืองฉะเชิงเทรา",
    lat: 13.68, lng: 101.06, in: 8, days: 0, free: true, startHour: 17, endHour: 22,
    organizer: "กลุ่มรถแปดริ้ว",
    description: "รวมรถแต่งและรถคลาสสิกจากฉะเชิงเทราและใกล้เคียง มีโซนถ่ายรูปและลานอาหาร" },

  // ── ปราจีนบุรี ────────────────────────────────────────────────────────────
  { province: "prachinburi", category: "culture", slug: "makha-puramee-si-prachin",
    title: "งานมาฆปูรมีศรีปราจีน", venue: "วัดสระมรกต", district: "ศรีมโหสถ",
    lat: 13.9, lng: 101.5, in: 114, days: 5, allDay: true, free: true,
    organizer: "จังหวัดปราจีนบุรี",
    description: "งานบุญรอบรอยพระพุทธบาทคู่ที่เก่าแก่ที่สุดในไทย มีเวียนเทียนและตลาดย้อนยุค" },

  { province: "prachinburi", category: "workshop", slug: "abhaibhubejhr-herb-fest",
    title: "เทศกาลสมุนไพรอภัยภูเบศร", venue: "โรงพยาบาลเจ้าพระยาอภัยภูเบศร", district: "เมืองปราจีนบุรี",
    lat: 14.053, lng: 101.372, in: 33, days: 4, free: true, startHour: 9, endHour: 18,
    organizer: "โรงพยาบาลเจ้าพระยาอภัยภูเบศร",
    description: "เวิร์กช็อปทำยาดมและลูกประคบสมุนไพร พร้อมตลาดสมุนไพรและอาคารเก่าสไตล์บาโรก" },

  { province: "prachinburi", category: "food", slug: "prachinburi-durian-fair",
    title: "เทศกาลทุเรียนปราจีนบุรี", venue: "สนามหน้าศาลากลางจังหวัดปราจีนบุรี", district: "เมืองปราจีนบุรี",
    lat: 14.06, lng: 101.36, in: 64, days: 5, allDay: true, free: true,
    organizer: "จังหวัดปราจีนบุรี",
    description: "ประกวดทุเรียนพันธุ์พื้นเมืองและทุเรียนหลง พร้อมตลาดผลไม้จากสวนในพื้นที่" },

  { province: "prachinburi", category: "sport", slug: "khao-ito-trail",
    title: "วิ่งเทรลเขาอีโต้", venue: "เขาอีโต้", district: "เมืองปราจีนบุรี",
    lat: 14.09, lng: 101.34, in: 51, days: 0, free: false, priceMin: 700, priceMax: 1300,
    startHour: 5, endHour: 12, organizer: "ชมรมวิ่งเทรลปราจีนบุรี",
    description: "วิ่งเทรลเส้นทางป่าเชิงเขา ระยะ 10 และ 21 กิโลเมตร เหมาะกับมือใหม่ถึงระดับกลาง" },

  { province: "prachinburi", category: "culture", slug: "loi-krathong-prachinburi",
    title: "ลอยกระทงแม่น้ำปราจีนบุรี", venue: "ท่าน้ำหน้าเมืองปราจีนบุรี", district: "เมืองปราจีนบุรี",
    lat: 14.049, lng: 101.368, in: 84, days: 2, allDay: true, free: true,
    organizer: "เทศบาลเมืองปราจีนบุรี",
    description: "ลอยกระทงริมแม่น้ำปราจีนบุรี มีการประกวดกระทงและนางนพมาศ พร้อมตลาดริมน้ำ" },

  // ── สระแก้ว ───────────────────────────────────────────────────────────────
  { province: "sa-kaeo", category: "food", slug: "rong-kluea-night-market",
    title: "ตลาดโรงเกลือไนท์มาร์เก็ต", venue: "ตลาดโรงเกลือ", district: "อรัญประเทศ",
    lat: 13.74, lng: 102.56, in: 3, days: 3, free: true, startHour: 16, endHour: 23,
    organizer: "เทศบาลเมืองอรัญญประเทศ",
    description: "ตลาดชายแดนที่ใหญ่ที่สุดของไทยในเวอร์ชันกลางคืน มีของมือสอง เสื้อผ้า และสตรีทฟู้ด" },

  { province: "sa-kaeo", category: "culture", slug: "sdok-kok-thom-ceremony",
    title: "งานบวงสรวงปราสาทสด๊กก๊อกธม", venue: "ปราสาทสด๊กก๊อกธม", district: "โคกสูง",
    lat: 13.86, lng: 102.6, in: 60, days: 2, allDay: true, free: true,
    organizer: "จังหวัดสระแก้ว",
    description: "พิธีบวงสรวงและการแสดงแสงสีเสียงกลางปราสาทหินขอมที่ใหญ่ที่สุดในภาคตะวันออก" },

  { province: "sa-kaeo", category: "sport", slug: "sdok-kok-thom-run",
    title: "วิ่งปราสาทสด๊กก๊อกธม", venue: "ปราสาทสด๊กก๊อกธม", district: "โคกสูง",
    lat: 13.861, lng: 102.601, in: 60, days: 0, free: false, priceMin: 400, priceMax: 900,
    startHour: 5, endHour: 9, organizer: "จังหวัดสระแก้ว",
    description: "วิ่งเส้นทางรอบปราสาทหินและทุ่งนา ระยะ 5 และ 10 กิโลเมตร จัดคู่กับงานบวงสรวง" },

  { province: "sa-kaeo", category: "culture", slug: "sa-kaeo-bun-bang-fai",
    title: "งานสืบสานประเพณีบุญบั้งไฟสระแก้ว", venue: "สนามหน้าที่ว่าการอำเภอวัฒนานคร", district: "วัฒนานคร",
    lat: 13.75, lng: 102.31, in: 23, days: 2, allDay: true, free: true,
    organizer: "อำเภอวัฒนานคร",
    description: "ขบวนแห่บั้งไฟและการจุดบั้งไฟขอฝนตามประเพณีอีสานที่ยังสืบทอดในสระแก้ว" },

  { province: "sa-kaeo", category: "other", slug: "tha-kabak-birdwatching",
    title: "เทศกาลดูนกอ่างเก็บน้ำท่ากะบาก", venue: "อ่างเก็บน้ำท่ากะบาก", district: "เมืองสระแก้ว",
    lat: 13.7, lng: 102.0, in: 86, days: 2, free: true, startHour: 6, endHour: 17,
    organizer: "สำนักงานทรัพยากรธรรมชาติและสิ่งแวดล้อมจังหวัดสระแก้ว",
    description: "กิจกรรมดูนกอพยพช่วงฤดูหนาว มีวิทยากรนำและกล้องส่องทางไกลให้ยืม" },

  // ── งานที่รอตรวจ (ไว้ดูหน้าแอดมิน) ────────────────────────────────────────
  { province: "chonburi", category: "music", slug: "jomtien-sunset-sessions",
    title: "จอมเทียนซันเซ็ตเซสชัน", venue: "ชายหาดจอมเทียน", district: "บางละมุง",
    lat: 12.888, lng: 100.874, in: 30, days: 1, free: false, priceMin: 300,
    startHour: 16, endHour: 22, organizer: "Jomtien Live", status: "pending",
    description: "เวทีดนตรีอะคูสติกริมหาดช่วงพระอาทิตย์ตก รับจำนวนจำกัดเพื่อไม่ให้แน่นเกินไป" },

  { province: "rayong", category: "workshop", slug: "ban-phe-fish-sauce-workshop",
    title: "เวิร์กช็อปทำน้ำปลาบ้านเพ", venue: "ชุมชนประมงบ้านเพ", district: "เมืองระยอง",
    lat: 12.628, lng: 101.437, in: 45, days: 0, free: false, priceMin: 550,
    startHour: 9, endHour: 15, organizer: "วิสาหกิจชุมชนบ้านเพ", status: "pending",
    description: "เรียนวิธีหมักน้ำปลาแบบดั้งเดิมจากชาวประมง พร้อมชิมและได้น้ำปลาขวดเล็กกลับบ้าน" },

  { province: "trat", category: "sport", slug: "koh-mak-open-water-swim",
    title: "เกาะหมากโอเพนวอเตอร์สวิม", venue: "หาดตะโล๊ะกระเบื้อง เกาะหมาก", district: "เกาะกูด",
    lat: 11.82, lng: 102.47, in: 77, days: 0, free: false, priceMin: 1200, priceMax: 2000,
    startHour: 7, endHour: 12, organizer: "ชมรมกีฬาทางน้ำตราด", status: "pending",
    description: "ว่ายน้ำทะเลระยะ 1.5 และ 3 กิโลเมตรในน้ำใส มีเรือคุ้มกันตลอดเส้นทาง" },
];

// ---------------------------------------------------------------------------
// ลงมือ
// ---------------------------------------------------------------------------

async function loadLookup(table) {
  const rows = await rest(`${table}?select=id,slug`);
  return new Map(rows.map((row) => [row.slug, row.id]));
}

async function clean() {
  const existing = await rest(`events?review_note=eq.${DEMO_MARK}&select=id`);
  await rest(`events?review_note=eq.${DEMO_MARK}`, { method: "DELETE" });
  console.log(`ลบข้อมูลตัวอย่างแล้ว ${existing.length} รายการ`);
}

async function seed() {
  const [provinces, categories] = await Promise.all([
    loadLookup("provinces"),
    loadLookup("categories"),
  ]);

  const rows = EVENTS.map((event) => {
    const provinceId = provinces.get(event.province);
    const categoryId = categories.get(event.category);
    // ล้มทั้งชุดเมื่อ slug ไม่ตรง ดีกว่าใส่ข้อมูลครึ่งๆ กลางๆ แล้วมาไล่หาทีหลังว่าอะไรหาย
    if (!provinceId) throw new Error(`ไม่รู้จักจังหวัด "${event.province}" (${event.slug})`);
    if (!categoryId) throw new Error(`ไม่รู้จักหมวดหมู่ "${event.category}" (${event.slug})`);

    const allDay = event.allDay ?? false;

    return {
      slug: event.slug,
      title: event.title,
      description: event.description,
      category_id: categoryId,
      province_id: provinceId,
      district: event.district ?? null,
      venue_name: event.venue ?? null,
      address: null,
      lat: event.lat ?? null,
      lng: event.lng ?? null,
      // งานที่ประกาศแค่วัน ให้กินทั้งวันตั้งแต่เที่ยงคืนถึงเที่ยงคืน
      start_at: at(event.in, allDay ? 0 : (event.startHour ?? 10)),
      end_at: at(event.in + (event.days ?? 0), allDay ? 23 : (event.endHour ?? 20)),
      is_all_day: allDay,
      cover_image_url: null,
      ticket_url: null,
      is_free: event.free,
      price_min: event.free ? null : (event.priceMin ?? null),
      price_max: event.free ? null : (event.priceMax ?? null),
      organizer_name: event.organizer ?? null,
      organizer_contact: null,
      source_url: null,
      status: event.status ?? "approved",
      review_note: DEMO_MARK,
    };
  });

  // ลบของเดิมก่อน เพื่อให้รันซ้ำได้โดยไม่ชนกับ unique constraint ของ slug
  await clean();

  await rest("events", { method: "POST", body: JSON.stringify(rows) });

  const approved = rows.filter((row) => row.status === "approved").length;
  const provinceCount = new Set(rows.map((row) => row.province_id)).size;
  const withPin = rows.filter((row) => row.lat !== null).length;

  console.log(`ใส่ข้อมูลตัวอย่างแล้ว ${rows.length} รายการ`);
  console.log(`  เผยแพร่ ${approved} · รอตรวจ ${rows.length - approved}`);
  console.log(`  ครอบคลุม ${provinceCount} จังหวัด · มีพิกัดปักหมุด ${withPin} รายการ`);
}

const args = process.argv.slice(2);
await (args.includes("--clean") ? clean() : seed());
