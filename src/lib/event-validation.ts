import { getCategory } from "@/lib/data/categories";
import { getProvince } from "@/lib/data/provinces";
import { ACTIVE_REGION_LABEL, isProvinceInScope } from "@/lib/region-scope";
import type { Category, Province } from "@/lib/types";

/**
 * กฎการตรวจข้อมูลงานที่ใช้ร่วมกันทั้งฟอร์มแจ้งงานสาธารณะและฟอร์มของแอดมิน
 *
 * ── ทำไมต้องแยกไฟล์นี้ออกมา ──
 * สองฟอร์มรับข้อมูลคนละชุด (สาธารณะกรอกน้อย แอดมินกรอกครบ) และมีกฎบางข้อต่างกันโดยตั้งใจ
 * แต่ "ชื่องานต้องยาว 5–200 ตัวอักษร" หรือ "จังหวัดต้องอยู่ในภาคที่เปิดรับ" ต้องเหมือนกันเสมอ
 * ถ้าปล่อยให้แต่ละฟอร์มเขียนเอง วันที่แก้กฎข้อหนึ่งจะเหลืออีกฟอร์มที่ยังใช้กฎเก่าโดยไม่มีใครรู้
 *
 * ทุกฟังก์ชันในไฟล์นี้เป็นฟังก์ชันบริสุทธิ์ ไม่แตะฐานข้อมูลและไม่แตะ Storage จึงทดสอบได้ตรงๆ
 * ตัวที่ตรวจแล้วไม่ผ่านจะ "คืนข้อความอธิบาย" ไม่ใช่ throw — เพราะฟอร์มต้องบอกผู้ใช้ให้ครบ
 * ทุกช่องในครั้งเดียว ไม่ใช่หยุดที่ข้อผิดพลาดแรก
 */

/** ชนิดไฟล์รูปที่รับ — ต้องตรงกับ allowed_mime_types ของ bucket ใน migration 0004 */
const COVER_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** เพดานขนาดไฟล์รูป — ต้องตรงกับ file_size_limit ของ bucket ใน migration 0004 */
const COVER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** รูปปกที่ผ่านการตรวจแล้ว — แนบนามสกุลไฟล์มาด้วย ผู้เรียกจะได้ไม่ต้องแปลง MIME type ซ้ำ */
export interface ValidCoverImage {
  file: File;
  extension: string;
}

// ---------------------------------------------------------------------------
// อ่านค่าจากฟอร์ม
// ---------------------------------------------------------------------------

/** ข้อความจากฟอร์ม ตัดช่องว่างหัวท้าย — ช่องที่ไม่มีหรือเป็นไฟล์จะได้ค่าว่าง */
export function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** ช่อง checkbox — เบราว์เซอร์ส่งค่ามาเฉพาะตอนติ๊ก ไม่ติ๊กคือไม่มีคีย์นั้นเลย */
export function readCheckbox(formData: FormData, key: string): boolean {
  return formData.get(key) != null;
}

/**
 * ตัวเลขจากฟอร์ม — คืน null เมื่อช่องว่าง และ NaN เมื่อกรอกเป็นอย่างอื่นที่ไม่ใช่ตัวเลข
 *
 * แยก "ว่าง" ออกจาก "กรอกผิด" เพราะสองกรณีนี้ต้องจัดการต่างกัน: ช่องราคาที่ว่างไว้แปลว่า
 * ไม่ระบุราคา (ถูกต้อง) ส่วนช่องที่พิมพ์ตัวอักษรลงไปคือข้อผิดพลาดที่ต้องบอกผู้ใช้
 */
export function readNumber(formData: FormData, key: string): number | null {
  const raw = readText(formData, key);
  return raw === "" ? null : Number(raw);
}

/**
 * ไฟล์รูปจากฟอร์ม
 *
 * เบราว์เซอร์ส่ง File ที่ size เป็น 0 มาให้เสมอแม้ผู้ใช้ไม่ได้เลือกไฟล์
 * จึงต้องเช็ค size > 0 ด้วย ไม่ใช่แค่ instanceof File
 */
export function readCoverImage(formData: FormData, key = "coverImage"): File | null {
  const raw = formData.get(key);
  return raw instanceof File && raw.size > 0 ? raw : null;
}

// ---------------------------------------------------------------------------
// ตัวตรวจรายช่อง — คืนข้อความอธิบายเมื่อผิด คืน undefined เมื่อผ่าน
// ---------------------------------------------------------------------------

export function validateTitle(title: string): string | undefined {
  if (title.length < 5) return "ใส่ชื่องานอย่างน้อย 5 ตัวอักษร";
  // 200 ตัวอักษรตรงกับ constraint events_title_length ใน migration 0003
  if (title.length > 200) return "ชื่องานยาวเกินไป (ไม่เกิน 200 ตัวอักษร)";
  return undefined;
}

export function validateDescription(description: string): string | undefined {
  if (description.length < 20) {
    return "อธิบายรายละเอียดงานอย่างน้อย 20 ตัวอักษร เพื่อให้คนอ่านเข้าใจว่างานเป็นยังไง";
  }
  if (description.length > 5000) return "รายละเอียดยาวเกินไป (ไม่เกิน 5,000 ตัวอักษร)";
  return undefined;
}

export function validateVenue(venueName: string): string | undefined {
  return venueName.length < 3 ? "ระบุชื่อสถานที่จัดงาน" : undefined;
}

/** ลิงก์ที่ไม่บังคับ — ว่างได้ แต่ถ้ากรอกมาต้องเป็น http/https ที่ใช้งานได้จริง */
export function validateOptionalUrl(raw: string): string | undefined {
  if (!raw) return undefined;

  try {
    const url = new URL(raw);
    if (url.protocol === "http:" || url.protocol === "https:") return undefined;
  } catch {
    // ตกลงมาที่ข้อความเดียวกันด้านล่าง — ผู้ใช้ไม่ต้องรู้ว่าพังเพราะ parse ไม่ได้หรือโปรโตคอลผิด
  }

  return "ลิงก์ไม่ถูกต้อง ใส่ให้ขึ้นต้นด้วย https://";
}

/** วันสิ้นสุดต้องไม่มาก่อนวันเริ่ม — เทียบสตริง 'YYYY-MM-DD' ตรงๆ ได้เพราะเรียงตามลำดับอยู่แล้ว */
export function validateDateOrder(startDate: string, endDate: string): string | undefined {
  if (!startDate || !endDate) return undefined;
  return endDate < startDate ? "วันสิ้นสุดต้องไม่มาก่อนวันเริ่มงาน" : undefined;
}

export function validateCoverImage(file: File | null): string | undefined {
  if (!file) return undefined;
  if (!COVER_IMAGE_TYPES[file.type]) return "รองรับเฉพาะไฟล์ JPG PNG และ WebP";
  if (file.size > COVER_IMAGE_MAX_BYTES) return "ไฟล์ใหญ่เกินไป ต้องไม่เกิน 5MB";
  return undefined;
}

/** แปลงไฟล์ที่ผ่านการตรวจแล้วเป็นรูปแบบที่ผู้เรียกใช้ตั้งชื่อไฟล์ตอนอัปโหลดได้เลย */
export function toValidCoverImage(file: File | null): ValidCoverImage | null {
  const extension = file ? COVER_IMAGE_TYPES[file.type] : undefined;
  return file && extension ? { file, extension } : null;
}

// ---------------------------------------------------------------------------
// แปลง slug เป็นข้อมูลจริง
// ---------------------------------------------------------------------------

/**
 * หาจังหวัดจาก slug พร้อมบังคับขอบเขตภาคที่เปิดรับงาน
 *
 * ต้องตรวจที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่พึ่งแค่ dropdown ที่กรองไว้แล้ว เพราะ dropdown เป็นแค่ HTML
 * ที่แก้ได้จากฝั่งผู้ใช้ — ยิง request ตรงเข้ามาเลือกจังหวัดไหนก็ได้
 */
export function resolveProvinceInScope(slug: string): {
  province: Province | null;
  error?: string;
} {
  const province = getProvince(slug);

  if (!province) return { province: null, error: "เลือกจังหวัดที่จัดงาน" };
  if (!isProvinceInScope(province.slug)) {
    return { province: null, error: `ตอนนี้เปิดรับเฉพาะงานใน${ACTIVE_REGION_LABEL}` };
  }

  return { province };
}

export function resolveCategory(slug: string): { category: Category | null; error?: string } {
  const category = getCategory(slug);
  return category ? { category } : { category: null, error: "เลือกหมวดหมู่งาน" };
}

// ---------------------------------------------------------------------------
// รวบรวมข้อผิดพลาด
// ---------------------------------------------------------------------------

/**
 * ใส่ข้อความผิดพลาดลงตาราง เฉพาะเมื่อมีข้อความจริง
 *
 * ⚠️ ห้ามเขียน `errors.title = validateTitle(title)` ตรงๆ
 * การกำหนดค่า undefined ยังทำให้คีย์นั้นมีอยู่ใน object และ Object.keys() จะนับเป็น
 * หนึ่งข้อผิดพลาดทั้งที่ไม่มีอะไรผิด — ฟอร์มจะตีกลับผู้ใช้โดยไม่มีข้อความให้แก้สักช่อง
 */
export function addError<Field extends string>(
  errors: Partial<Record<Field, string>>,
  field: Field,
  message: string | undefined,
): void {
  if (message) errors[field] = message;
}
