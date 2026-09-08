import {
  addError,
  readCoverImage,
  readText,
  resolveCategory,
  resolveProvinceInScope,
  toValidCoverImage,
  validateCoverImage,
  validateDateOrder,
  validateDescription,
  validateOptionalUrl,
  validateTitle,
  validateVenue,
  type ValidCoverImage,
} from "@/lib/event-validation";
import { bangkokDay } from "@/lib/format";
import type { Category, Province } from "@/lib/types";

/**
 * ตรวจข้อมูลจากฟอร์มแจ้งงานสาธารณะ
 *
 * แยกออกจาก Server Action เพราะเป็นตรรกะบริสุทธิ์ล้วน (FormData เข้า → ผลตรวจออก)
 * ไม่แตะฐานข้อมูล ไม่แตะ Storage จึงทดสอบได้ตรงๆ โดยไม่ต้อง mock อะไรเลย
 * ส่วน action เหลือหน้าที่เดียวคือ "เอาผลที่ตรวจแล้วไปบันทึก"
 *
 * ⚠️ การตรวจฝั่งเซิร์ฟเวอร์คือด่านจริง ไม่ใช่ attribute required/minlength ของ HTML
 * ซึ่งถูกข้ามได้ง่ายด้วยการยิง request ตรงเข้ามา
 *
 * กฎพื้นฐานที่ใช้ร่วมกับฟอร์มของแอดมินอยู่ใน `lib/event-validation.ts` ไฟล์นี้เก็บเฉพาะ
 * กฎที่เป็นของฟอร์มสาธารณะโดยเฉพาะ: ต้องมีช่องทางติดต่อ และห้ามแจ้งงานที่ผ่านไปแล้ว
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

const DAY_MS = 86_400_000;

/**
 * ข้อมูลที่ผ่านการตรวจแล้ว
 *
 * จังหวัดกับหมวดหมู่เป็น object ที่หาเจอแล้ว ไม่ใช่ slug ดิบ — ผู้เรียกจึงไม่ต้อง lookup ซ้ำ
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

/**
 * @param now เวลาอ้างอิงสำหรับตรวจว่างานผ่านมาแล้วหรือยัง — รับเข้ามาเพื่อให้เทสต์ตรึงเวลาได้
 */
export function validateSubmission(formData: FormData, now: Date = new Date()): SubmitValidation {
  const errors: SubmitErrors = {};

  const title = readText(formData, "title");
  const description = readText(formData, "description");
  const venueName = readText(formData, "venueName");
  const startDate = readText(formData, "startDate");
  const endDate = readText(formData, "endDate");
  const contact = readText(formData, "contact");
  const sourceUrl = readText(formData, "sourceUrl");
  const mapLink = readText(formData, "mapLink");

  const coverFile = readCoverImage(formData);
  addError(errors, "coverImage", validateCoverImage(coverFile));

  addError(errors, "title", validateTitle(title));
  addError(errors, "description", validateDescription(description));
  addError(errors, "venueName", validateVenue(venueName));
  addError(errors, "sourceUrl", validateOptionalUrl(sourceUrl));
  addError(errors, "endDate", validateDateOrder(startDate, endDate));

  const { category, error: categoryError } = resolveCategory(readText(formData, "category"));
  addError(errors, "category", categoryError);

  const { province, error: provinceError } = resolveProvinceInScope(
    readText(formData, "province"),
  );
  addError(errors, "province", provinceError);

  if (!startDate) {
    errors.startDate = "เลือกวันที่เริ่มงาน";
  } else {
    /*
      เทียบกับ "เมื่อวาน" ไม่ใช่ "ตอนนี้" เผื่องานที่กำลังจัดอยู่วันนี้

      ⚠️ ต้องผ่าน bangkokDay() เท่านั้น — toISOString() ให้วันตามเวลา UTC ซึ่งช่วง
      ตี 0 ถึง 7 โมงเช้าของไทยยังเป็นวันก่อนหน้า ทำให้ด่านนี้หย่อนไปหนึ่งวันในช่วงเช้ามืด
      (กฎเดียวกับทั้งโปรเจกต์: วันเวลาทุกจุดผ่าน lib/format.ts)

      ฟอร์มของแอดมินตั้งใจไม่มีกฎข้อนี้ — แอดมินต้องแก้งานเก่าและกรอกย้อนหลังได้
    */
    const yesterday = bangkokDay(new Date(now.getTime() - DAY_MS));
    if (startDate < yesterday) errors.startDate = "วันที่เริ่มงานผ่านมาแล้ว";
  }

  if (contact.length < 5) {
    errors.contact = "ใส่ช่องทางติดต่อผู้จัด เพื่อให้ทีมงานตรวจสอบข้อมูลได้";
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
      coverImage: toValidCoverImage(coverFile),
    },
  };
}
