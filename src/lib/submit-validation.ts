import { getCategory } from "@/lib/data/categories";
import { getProvince } from "@/lib/data/provinces";
import { bangkokDay } from "@/lib/format";
import { ACTIVE_REGION_LABEL, isProvinceInScope } from "@/lib/region-scope";
import type { Category, Province } from "@/lib/types";

/**
 * ตรวจข้อมูลจากฟอร์มแจ้งงาน
 *
 * แยกออกจาก Server Action เพราะเป็นตรรกะบริสุทธิ์ล้วน (FormData เข้า → ผลตรวจออก)
 * ไม่แตะฐานข้อมูล ไม่แตะ Storage จึงทดสอบได้ตรงๆ โดยไม่ต้อง mock อะไรเลย
 * ส่วน action เหลือหน้าที่เดียวคือ "เอาผลที่ตรวจแล้วไปบันทึก"
 *
 * ⚠️ การตรวจฝั่งเซิร์ฟเวอร์คือด่านจริง ไม่ใช่ attribute required/minlength ของ HTML
 * ซึ่งถูกข้ามได้ง่ายด้วยการยิง request ตรงเข้ามา
 */

/** ชื่อช่องในฟอร์ม — เป็น union ไม่ใช่ string เพื่อให้ TypeScript จับคำสะกดผิดตั้งแต่ตอน build */
export type SubmitField =
  | "title"
  | "description"
  | "category"
  | "province"
  | "venueName"
  | "mapLink"
  | "startDate"
  | "endDate"
  | "coverImage"
  | "contact"
  | "sourceUrl";

export type SubmitErrors = Partial<Record<SubmitField, string>>;

/** ชนิดไฟล์รูปที่รับ — ต้องตรงกับ allowed_mime_types ของ bucket ใน migration 0004 */
const COVER_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** เพดานขนาดไฟล์รูป — ต้องตรงกับ file_size_limit ของ bucket ใน migration 0004 */
const COVER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const DAY_MS = 86_400_000;

/** รูปปกที่ผ่านการตรวจแล้ว — แนบนามสกุลไฟล์มาด้วย ผู้เรียกจะได้ไม่ต้องแปลง MIME type ซ้ำ */
export interface ValidCoverImage {
  file: File;
  extension: string;
}

/**
 * ข้อมูลที่ผ่านการตรวจแล้ว
 *
 * จังหวัดกับหมวดหมู่เป็น object ที่หาเจอแล้ว ไม่ใช่ slug ดิบ — ผู้เรียกจึงไม่ต้อง lookup ซ้ำ
 * แล้วเติม `!` เพื่อยืนยันกับ TypeScript ว่ามีจริง (ซึ่งเป็นการยืนยันที่ตัวคอมไพเลอร์ตรวจให้ไม่ได้)
 */
export interface ValidSubmission {
  title: string;
  description: string;
  category: Category;
  province: Province;
  venueName: string;
  /** 'YYYY-MM-DD' */
  startDate: string;
  /** 'YYYY-MM-DD' — งานวันเดียวจะเท่ากับ startDate */
  endDate: string;
  contact: string;
  mapLink: string;
  sourceUrl: string;
  coverImage: ValidCoverImage | null;
}

export type SubmitValidation =
  | { ok: true; value: ValidSubmission }
  | { ok: false; errors: SubmitErrors };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isValidHttpUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * @param now เวลาอ้างอิงสำหรับตรวจว่างานผ่านมาแล้วหรือยัง — รับเข้ามาเพื่อให้เทสต์ตรึงเวลาได้
 */
export function validateSubmission(formData: FormData, now: Date = new Date()): SubmitValidation {
  const errors: SubmitErrors = {};

  const title = text(formData, "title");
  const description = text(formData, "description");
  const categorySlug = text(formData, "category");
  const provinceSlug = text(formData, "province");
  const venueName = text(formData, "venueName");
  const startDate = text(formData, "startDate");
  const endDate = text(formData, "endDate");
  const contact = text(formData, "contact");
  const sourceUrl = text(formData, "sourceUrl");
  const mapLink = text(formData, "mapLink");

  /*
    ช่องรูปไม่บังคับ — เบราว์เซอร์ส่ง File ที่ size เป็น 0 มาให้เสมอแม้ผู้ใช้ไม่ได้เลือกไฟล์
    จึงต้องเช็ค size > 0 ด้วย ไม่ใช่แค่ instanceof File
  */
  const rawCover = formData.get("coverImage");
  const coverFile = rawCover instanceof File && rawCover.size > 0 ? rawCover : null;
  const coverExtension = coverFile ? COVER_IMAGE_TYPES[coverFile.type] : undefined;

  if (coverFile) {
    if (!coverExtension) {
      errors.coverImage = "รองรับเฉพาะไฟล์ JPG PNG และ WebP";
    } else if (coverFile.size > COVER_IMAGE_MAX_BYTES) {
      errors.coverImage = "ไฟล์ใหญ่เกินไป ต้องไม่เกิน 5MB";
    }
  }

  if (title.length < 5) errors.title = "ใส่ชื่องานอย่างน้อย 5 ตัวอักษร";
  if (title.length > 200) errors.title = "ชื่องานยาวเกินไป (ไม่เกิน 200 ตัวอักษร)";

  if (description.length < 20) {
    errors.description = "อธิบายรายละเอียดงานอย่างน้อย 20 ตัวอักษร เพื่อให้คนอ่านเข้าใจว่างานเป็นยังไง";
  }

  const category = getCategory(categorySlug);
  if (!category) errors.category = "เลือกหมวดหมู่งาน";

  /*
    ต้องตรวจ "อยู่ในภาคที่เปิดรับ" ที่ฝั่งเซิร์ฟเวอร์ด้วย ไม่ใช่พึ่งแค่ dropdown ที่กรองไว้แล้ว
    เพราะ dropdown เป็นแค่ HTML ที่แก้ได้จากฝั่งผู้ใช้ ยิง request ตรงมาเลือกจังหวัดไหนก็ได้
  */
  const province = getProvince(provinceSlug);
  if (!province) {
    errors.province = "เลือกจังหวัดที่จัดงาน";
  } else if (!isProvinceInScope(province.slug)) {
    errors.province = `ตอนนี้เปิดรับเฉพาะงานใน${ACTIVE_REGION_LABEL}`;
  }

  if (venueName.length < 3) errors.venueName = "ระบุชื่อสถานที่จัดงาน";

  if (!startDate) {
    errors.startDate = "เลือกวันที่เริ่มงาน";
  } else {
    /*
      เทียบกับ "เมื่อวาน" ไม่ใช่ "ตอนนี้" เผื่องานที่กำลังจัดอยู่วันนี้

      ⚠️ ต้องผ่าน bangkokDay() เท่านั้น — toISOString() ให้วันตามเวลา UTC ซึ่งช่วง
      ตี 0 ถึง 7 โมงเช้าของไทยยังเป็นวันก่อนหน้า ทำให้ด่านนี้หย่อนไปหนึ่งวันในช่วงเช้ามืด
      (กฎเดียวกับทั้งโปรเจกต์: วันเวลาทุกจุดผ่าน lib/format.ts)
    */
    const yesterday = bangkokDay(new Date(now.getTime() - DAY_MS));
    if (startDate < yesterday) errors.startDate = "วันที่เริ่มงานผ่านมาแล้ว";
  }

  if (endDate && startDate && endDate < startDate) {
    errors.endDate = "วันสิ้นสุดต้องไม่มาก่อนวันเริ่มงาน";
  }

  if (contact.length < 5) {
    errors.contact = "ใส่ช่องทางติดต่อผู้จัด เพื่อให้ทีมงานตรวจสอบข้อมูลได้";
  }

  if (sourceUrl && !isValidHttpUrl(sourceUrl)) {
    errors.sourceUrl = "ลิงก์ไม่ถูกต้อง ใส่ให้ขึ้นต้นด้วย https://";
  }

  /*
    เช็ค category/province ซ้ำในเงื่อนไขเดียวกัน ทั้งที่ทั้งคู่ตั้ง error ไว้แล้วถ้าหาไม่เจอ
    เพื่อให้ TypeScript รู้เองว่าโค้ดข้างล่างมีค่าทั้งสองแน่ — ไม่ต้องเติม `!`
    ซึ่งเป็นการยืนยันด้วยปากเปล่าที่คอมไพเลอร์ตรวจให้ไม่ได้ว่าจริงหรือเปล่า
  */
  if (!category || !province || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      title,
      description,
      category,
      province,
      venueName,
      startDate,
      // ฟอร์มไม่บังคับวันสิ้นสุด — งานวันเดียวใช้วันเริ่มเป็นวันจบ
      endDate: endDate || startDate,
      contact,
      mapLink,
      sourceUrl,
      coverImage: coverFile && coverExtension ? { file: coverFile, extension: coverExtension } : null,
    },
  };
}
