import type { Province, Region } from "@/lib/types";

/**
 * 77 จังหวัดของไทย
 *
 * ไฟล์นี้เป็นคู่แฝดของ supabase/migrations/0002_seed_reference.sql
 * ถ้าแก้ที่นี่ต้องแก้ที่ SQL ด้วย (และกลับกัน)
 *
 * lat/lng เป็นพิกัดตัวเมืองโดยประมาณ ใช้เป็น fallback ของฟีเจอร์ "งานใกล้ฉัน"
 * เมื่ออีเวนต์ยังไม่ได้ระบุพิกัดที่แม่นยำของตัวเอง
 */

type ProvinceRow = [
  code: string,
  slug: string,
  nameTh: string,
  nameEn: string,
  region: Region,
  lat: number,
  lng: number,
];

const ROWS: ProvinceRow[] = [
  // ภาคเหนือ
  ["TH-50", "chiang-mai", "เชียงใหม่", "Chiang Mai", "north", 18.7883, 98.9853],
  ["TH-57", "chiang-rai", "เชียงราย", "Chiang Rai", "north", 19.9105, 99.8406],
  ["TH-52", "lampang", "ลำปาง", "Lampang", "north", 18.2888, 99.4909],
  ["TH-51", "lamphun", "ลำพูน", "Lamphun", "north", 18.5744, 99.0087],
  ["TH-58", "mae-hong-son", "แม่ฮ่องสอน", "Mae Hong Son", "north", 19.302, 97.9654],
  ["TH-55", "nan", "น่าน", "Nan", "north", 18.7756, 100.773],
  ["TH-56", "phayao", "พะเยา", "Phayao", "north", 19.1664, 99.9003],
  ["TH-54", "phrae", "แพร่", "Phrae", "north", 18.1445, 100.1405],
  ["TH-53", "uttaradit", "อุตรดิตถ์", "Uttaradit", "north", 17.62, 100.0993],

  // ภาคตะวันออกเฉียงเหนือ
  ["TH-37", "amnat-charoen", "อำนาจเจริญ", "Amnat Charoen", "northeast", 15.8657, 104.6265],
  ["TH-38", "bueng-kan", "บึงกาฬ", "Bueng Kan", "northeast", 18.3609, 103.6466],
  ["TH-31", "buriram", "บุรีรัมย์", "Buri Ram", "northeast", 14.993, 103.1029],
  ["TH-36", "chaiyaphum", "ชัยภูมิ", "Chaiyaphum", "northeast", 15.8068, 102.0317],
  ["TH-46", "kalasin", "กาฬสินธุ์", "Kalasin", "northeast", 16.4315, 103.5059],
  ["TH-40", "khon-kaen", "ขอนแก่น", "Khon Kaen", "northeast", 16.4419, 102.836],
  ["TH-42", "loei", "เลย", "Loei", "northeast", 17.486, 101.7223],
  ["TH-44", "maha-sarakham", "มหาสารคาม", "Maha Sarakham", "northeast", 16.185, 103.3007],
  ["TH-49", "mukdahan", "มุกดาหาร", "Mukdahan", "northeast", 16.542, 104.7207],
  ["TH-48", "nakhon-phanom", "นครพนม", "Nakhon Phanom", "northeast", 17.4108, 104.7784],
  ["TH-30", "nakhon-ratchasima", "นครราชสีมา", "Nakhon Ratchasima", "northeast", 14.9799, 102.0977],
  ["TH-39", "nong-bua-lamphu", "หนองบัวลำภู", "Nong Bua Lam Phu", "northeast", 17.2218, 102.426],
  ["TH-43", "nong-khai", "หนองคาย", "Nong Khai", "northeast", 17.8783, 102.742],
  ["TH-45", "roi-et", "ร้อยเอ็ด", "Roi Et", "northeast", 16.0538, 103.652],
  ["TH-47", "sakon-nakhon", "สกลนคร", "Sakon Nakhon", "northeast", 17.1664, 104.1486],
  ["TH-33", "sisaket", "ศรีสะเกษ", "Si Sa Ket", "northeast", 15.1186, 104.322],
  ["TH-32", "surin", "สุรินทร์", "Surin", "northeast", 14.8818, 103.4936],
  ["TH-34", "ubon-ratchathani", "อุบลราชธานี", "Ubon Ratchathani", "northeast", 15.2448, 104.8473],
  ["TH-41", "udon-thani", "อุดรธานี", "Udon Thani", "northeast", 17.4138, 102.787],
  ["TH-35", "yasothon", "ยโสธร", "Yasothon", "northeast", 15.7921, 104.1452],

  // ภาคกลาง
  ["TH-15", "ang-thong", "อ่างทอง", "Ang Thong", "central", 14.5896, 100.455],
  ["TH-10", "bangkok", "กรุงเทพมหานคร", "Bangkok", "central", 13.7563, 100.5018],
  ["TH-18", "chai-nat", "ชัยนาท", "Chai Nat", "central", 15.1851, 100.1251],
  ["TH-62", "kamphaeng-phet", "กำแพงเพชร", "Kamphaeng Phet", "central", 16.4827, 99.5226],
  ["TH-16", "lopburi", "ลพบุรี", "Lop Buri", "central", 14.7995, 100.6534],
  ["TH-26", "nakhon-nayok", "นครนายก", "Nakhon Nayok", "central", 14.2069, 101.213],
  ["TH-73", "nakhon-pathom", "นครปฐม", "Nakhon Pathom", "central", 13.8199, 100.0621],
  ["TH-60", "nakhon-sawan", "นครสวรรค์", "Nakhon Sawan", "central", 15.7047, 100.1372],
  ["TH-12", "nonthaburi", "นนทบุรี", "Nonthaburi", "central", 13.8591, 100.5217],
  ["TH-13", "pathum-thani", "ปทุมธานี", "Pathum Thani", "central", 14.0208, 100.525],
  ["TH-67", "phetchabun", "เพชรบูรณ์", "Phetchabun", "central", 16.419, 101.1591],
  ["TH-66", "phichit", "พิจิตร", "Phichit", "central", 16.4429, 100.3487],
  ["TH-65", "phitsanulok", "พิษณุโลก", "Phitsanulok", "central", 16.8211, 100.2659],
  ["TH-14", "ayutthaya", "พระนครศรีอยุธยา", "Phra Nakhon Si Ayutthaya", "central", 14.3532, 100.5689],
  ["TH-11", "samut-prakan", "สมุทรปราการ", "Samut Prakan", "central", 13.5991, 100.5998],
  ["TH-74", "samut-sakhon", "สมุทรสาคร", "Samut Sakhon", "central", 13.5475, 100.2745],
  ["TH-75", "samut-songkhram", "สมุทรสงคราม", "Samut Songkhram", "central", 13.4098, 100.0022],
  ["TH-19", "saraburi", "สระบุรี", "Saraburi", "central", 14.5289, 100.9101],
  ["TH-17", "sing-buri", "สิงห์บุรี", "Sing Buri", "central", 14.8879, 100.4017],
  ["TH-64", "sukhothai", "สุโขทัย", "Sukhothai", "central", 17.0078, 99.8237],
  ["TH-72", "suphan-buri", "สุพรรณบุรี", "Suphan Buri", "central", 14.4745, 100.1177],
  ["TH-61", "uthai-thani", "อุทัยธานี", "Uthai Thani", "central", 15.3835, 100.0246],

  // ภาคตะวันออก
  ["TH-24", "chachoengsao", "ฉะเชิงเทรา", "Chachoengsao", "east", 13.6904, 101.0779],
  ["TH-22", "chanthaburi", "จันทบุรี", "Chanthaburi", "east", 12.6113, 102.1039],
  ["TH-20", "chonburi", "ชลบุรี", "Chon Buri", "east", 13.3611, 100.9847],
  ["TH-25", "prachinburi", "ปราจีนบุรี", "Prachin Buri", "east", 14.05, 101.37],
  ["TH-21", "rayong", "ระยอง", "Rayong", "east", 12.6814, 101.2816],
  ["TH-27", "sa-kaeo", "สระแก้ว", "Sa Kaeo", "east", 13.824, 102.0645],
  ["TH-23", "trat", "ตราด", "Trat", "east", 12.2428, 102.5175],

  // ภาคตะวันตก
  ["TH-71", "kanchanaburi", "กาญจนบุรี", "Kanchanaburi", "west", 14.0227, 99.5328],
  ["TH-76", "phetchaburi", "เพชรบุรี", "Phetchaburi", "west", 13.1119, 99.9399],
  ["TH-77", "prachuap-khiri-khan", "ประจวบคีรีขันธ์", "Prachuap Khiri Khan", "west", 11.8126, 99.7957],
  ["TH-70", "ratchaburi", "ราชบุรี", "Ratchaburi", "west", 13.5283, 99.8134],
  ["TH-63", "tak", "ตาก", "Tak", "west", 16.8839, 99.1258],

  // ภาคใต้
  ["TH-86", "chumphon", "ชุมพร", "Chumphon", "south", 10.493, 99.18],
  ["TH-81", "krabi", "กระบี่", "Krabi", "south", 8.0863, 98.9063],
  ["TH-80", "nakhon-si-thammarat", "นครศรีธรรมราช", "Nakhon Si Thammarat", "south", 8.4304, 99.9631],
  ["TH-96", "narathiwat", "นราธิวาส", "Narathiwat", "south", 6.4254, 101.8253],
  ["TH-94", "pattani", "ปัตตานี", "Pattani", "south", 6.8692, 101.255],
  ["TH-82", "phang-nga", "พังงา", "Phang Nga", "south", 8.4501, 98.5255],
  ["TH-93", "phatthalung", "พัทลุง", "Phatthalung", "south", 7.6167, 100.0742],
  ["TH-83", "phuket", "ภูเก็ต", "Phuket", "south", 7.8804, 98.3923],
  ["TH-85", "ranong", "ระนอง", "Ranong", "south", 9.9529, 98.6085],
  ["TH-91", "satun", "สตูล", "Satun", "south", 6.6238, 100.0674],
  ["TH-90", "songkhla", "สงขลา", "Songkhla", "south", 7.1897, 100.5951],
  ["TH-84", "surat-thani", "สุราษฎร์ธานี", "Surat Thani", "south", 9.1382, 99.3215],
  ["TH-92", "trang", "ตรัง", "Trang", "south", 7.5563, 99.6114],
  ["TH-95", "yala", "ยะลา", "Yala", "south", 6.541, 101.281],
];

export const PROVINCES: Province[] = ROWS.map(
  ([code, slug, nameTh, nameEn, region, lat, lng], index) => ({
    id: index + 1,
    code,
    slug,
    nameTh,
    nameEn,
    region,
    lat,
    lng,
  }),
);

const BY_SLUG = new Map(PROVINCES.map((p) => [p.slug, p]));

export function getProvince(slug: string): Province | undefined {
  return BY_SLUG.get(slug);
}

const REGION_LABELS: Record<Region, string> = {
  north: "ภาคเหนือ",
  northeast: "ภาคอีสาน",
  central: "ภาคกลาง",
  east: "ภาคตะวันออก",
  west: "ภาคตะวันตก",
  south: "ภาคใต้",
};

/** เรียงตามภาค แล้วเรียงชื่อไทยตามลำดับพจนานุกรม — ใช้ทำ dropdown เลือกจังหวัด */
export const PROVINCES_BY_REGION: { region: Region; label: string; provinces: Province[] }[] = (
  Object.keys(REGION_LABELS) as Region[]
).map((region) => ({
  region,
  label: REGION_LABELS[region],
  provinces: PROVINCES.filter((p) => p.region === region).sort((a, b) =>
    a.nameTh.localeCompare(b.nameTh, "th"),
  ),
}));
