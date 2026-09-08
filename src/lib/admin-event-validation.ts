import {
  addError,
  readCheckbox,
  readCoverImage,
  readNumber,
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
import type { Category, EventStatus, Province } from "@/lib/types";

/**
 * ตรวจข้อมูลจากฟอร์มจัดการงานของแอดมิน
 *
 * ต่างจาก `lib/submit-validation.ts` (ฟอร์มสาธารณะ) สามเรื่อง:
 *
 *   1. รับครบทุกคอลัมน์ที่ตาราง events มี — เวลาเริ่ม-จบจริง ราคา ลิงก์บัตร ชื่อผู้จัด
 *      อำเภอ และที่อยู่ ซึ่งฟอร์มสาธารณะตั้งใจไม่ถามเพราะจะทำให้คนทั่วไปกรอกไม่จบ
 *   2. ไม่ห้ามวันที่ย้อนหลัง — แอดมินต้องแก้งานที่ผ่านไปแล้วได้ และงานที่จบแล้วก็ไม่ขึ้น
 *      หน้าเว็บอยู่ดีเพราะ listEvents() กรองด้วย end_at
 *   3. ตั้งสถานะเองได้ ต่างจากฟอร์มสาธารณะที่บังคับเป็น pending เสมอ
 *
 * กฎพื้นฐานที่เหมือนกันทั้งสองฟอร์มอยู่ใน `lib/event-validation.ts`
 */

export type AdminEventField =
  | "title"
  | "description"
  | "category"
  | "province"
  | "district"
  | "venueName"
  | "address"
  | "mapLink"
  | "startDate"
  | "endDate"
  | "startTime"
  | "endTime"
  | "priceMin"
  | "priceMax"
  | "ticketUrl"
  | "organizerName"
  | "contact"
  | "sourceUrl"
  | "coverImage"
  | "status";

export type AdminEventErrors = Partial<Record<AdminEventField, string>>;

/** สถานะที่แอดมินตั้งได้จากฟอร์ม — 'archived' ยังไม่มีที่ใช้ใน UI จึงไม่เปิดรับ */
const SELECTABLE_STATUSES = ["draft", "pending", "approved", "rejected"] as const;

export type SelectableStatus = (typeof SELECTABLE_STATUSES)[number];

export const STATUS_LABELS: Record<SelectableStatus, string> = {
  draft: "ร่าง",
  pending: "รอตรวจสอบ",
  approved: "เผยแพร่",
  rejected: "ปฏิเสธ",
};

/** เขตเวลาไทยตายตัว — ตรงกับกฎของทั้งโปรเจกต์ที่ไม่ปล่อยให้ Postgres เดาเป็น UTC */
const BANGKOK_OFFSET = "+07:00";

/** 'HH:MM' หรือ 'HH:MM:SS' — รูปแบบที่ <input type="time"> ส่งมา */
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/**
 * ข้อมูลที่ผ่านการตรวจแล้ว พร้อมบันทึกลงฐานข้อมูล
 *
 * เวลาถูกประกอบเป็น ISO string พร้อม offset ไทยเรียบร้อยแล้ว ผู้เรียกจึงส่งลง Supabase
 * ได้เลยโดยไม่ต้องคิดเรื่องเขตเวลาอีก — และการประกอบอยู่ในไฟล์นี้ทำให้เทสต์ตรวจได้
 */
export interface ValidAdminEvent {
  /** null เมื่อเป็นงานใหม่ */
  id: string | null;
  title: string;
  description: string;
  category: Category;
  province: Province;
  district: string | null;
  venueName: string;
  address: string | null;
  /** ลิงก์ Google Maps ดิบ — ผู้เรียกเป็นคนแปลงเป็นพิกัด (ต้องยิง request จึงทำที่นี่ไม่ได้) */
  mapLink: string;
  /** ISO 8601 พร้อม offset +07:00 */
  startAt: string;
  endAt: string;
  isAllDay: boolean;
  isFree: boolean;
  priceMin: number | null;
  priceMax: number | null;
  ticketUrl: string | null;
  organizerName: string | null;
  contact: string | null;
  sourceUrl: string | null;
  status: SelectableStatus;
  coverImage: ValidCoverImage | null;
}

export type AdminEventValidation =
  | { ok: true; value: ValidAdminEvent }
  | { ok: false; errors: AdminEventErrors };

/** ค่าว่างในฟอร์มต้องกลายเป็น null ไม่ใช่ '' เพราะคอลัมน์เหล่านี้ nullable ในฐานข้อมูล */
function orNull(value: string): string | null {
  return value || null;
}

function isSelectableStatus(value: string): value is SelectableStatus {
  return (SELECTABLE_STATUSES as readonly string[]).includes(value);
}

/**
 * ตรวจช่องเวลาของงานที่ระบุเวลา
 *
 * คืนข้อความผิดพลาดรายช่อง — ช่องเวลาเริ่มกับเวลาจบแยกกันเพื่อให้ฟอร์มชี้ได้ถูกช่อง
 */
function validateTimes(
  isAllDay: boolean,
  startDate: string,
  endDate: string,
  startTime: string,
  endTime: string,
): { startTime?: string; endTime?: string } {
  if (isAllDay) return {};

  if (!TIME_PATTERN.test(startTime)) return { startTime: "ใส่เวลาเริ่มงาน เช่น 18:00" };
  if (!TIME_PATTERN.test(endTime)) return { endTime: "ใส่เวลาสิ้นสุดงาน เช่น 23:00" };

  /*
    เทียบเวลาเฉพาะตอนที่เป็นวันเดียวกัน — งานข้ามคืนอย่างคอนเสิร์ตที่เริ่มสามทุ่ม
    แล้วจบตีสองของอีกวัน มีเวลาจบ "น้อยกว่า" เวลาเริ่มโดยถูกต้อง
  */
  if (startDate === endDate && endTime <= startTime) {
    return { endTime: "เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม — งานที่ไม่รู้เวลาจบให้ติ๊ก ไม่ระบุเวลา" };
  }

  return {};
}

/** ตรวจช่วงราคาของงานที่เก็บเงิน */
function validatePrices(
  isFree: boolean,
  priceMin: number | null,
  priceMax: number | null,
): { priceMin?: string; priceMax?: string } {
  // งานเข้าฟรีไม่ต้องดูช่องราคาเลย ค่าที่ค้างอยู่จะถูกล้างทิ้งตอนประกอบผลลัพธ์
  if (isFree) return {};

  const errors: { priceMin?: string; priceMax?: string } = {};

  for (const [field, value] of [
    ["priceMin", priceMin],
    ["priceMax", priceMax],
  ] as const) {
    if (value == null) continue;
    if (!Number.isInteger(value) || value < 0) {
      errors[field] = "ราคาต้องเป็นจำนวนเต็มไม่ติดลบ";
    }
  }

  // ตรงกับ constraint events_price_range ในฐานข้อมูล — ถ้าปล่อยผ่าน insert จะถูกปฏิเสธ
  // แล้วผู้ใช้จะเห็นแค่ "บันทึกไม่สำเร็จ" โดยไม่รู้ว่าผิดตรงไหน
  if (!errors.priceMin && !errors.priceMax && priceMin != null && priceMax != null) {
    if (priceMax < priceMin) errors.priceMax = "ราคาสูงสุดต้องไม่น้อยกว่าราคาต่ำสุด";
  }

  return errors;
}

export function validateAdminEvent(formData: FormData): AdminEventValidation {
  const errors: AdminEventErrors = {};

  const id = readText(formData, "id");
  const title = readText(formData, "title");
  const description = readText(formData, "description");
  const district = readText(formData, "district");
  const venueName = readText(formData, "venueName");
  const address = readText(formData, "address");
  const mapLink = readText(formData, "mapLink");
  const startDate = readText(formData, "startDate");
  const endDate = readText(formData, "endDate") || startDate;
  const startTime = readText(formData, "startTime");
  const endTime = readText(formData, "endTime");
  const ticketUrl = readText(formData, "ticketUrl");
  const organizerName = readText(formData, "organizerName");
  const contact = readText(formData, "contact");
  const sourceUrl = readText(formData, "sourceUrl");
  const status = readText(formData, "status");

  const isAllDay = readCheckbox(formData, "isAllDay");
  const isFree = readCheckbox(formData, "isFree");
  const priceMin = readNumber(formData, "priceMin");
  const priceMax = readNumber(formData, "priceMax");

  const coverFile = readCoverImage(formData);

  addError(errors, "title", validateTitle(title));
  addError(errors, "description", validateDescription(description));
  addError(errors, "venueName", validateVenue(venueName));
  addError(errors, "coverImage", validateCoverImage(coverFile));
  addError(errors, "ticketUrl", validateOptionalUrl(ticketUrl));
  addError(errors, "sourceUrl", validateOptionalUrl(sourceUrl));
  addError(errors, "endDate", validateDateOrder(startDate, endDate));

  const { category, error: categoryError } = resolveCategory(readText(formData, "category"));
  addError(errors, "category", categoryError);

  const { province, error: provinceError } = resolveProvinceInScope(readText(formData, "province"));
  addError(errors, "province", provinceError);

  if (!startDate) errors.startDate = "เลือกวันที่จัดงาน";

  const timeErrors = validateTimes(isAllDay, startDate, endDate, startTime, endTime);
  addError(errors, "startTime", timeErrors.startTime);
  addError(errors, "endTime", timeErrors.endTime);

  const priceErrors = validatePrices(isFree, priceMin, priceMax);
  addError(errors, "priceMin", priceErrors.priceMin);
  addError(errors, "priceMax", priceErrors.priceMax);

  if (!isSelectableStatus(status)) errors.status = "เลือกสถานะของงาน";

  if (!category || !province || !isSelectableStatus(status) || Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  /*
    ประกอบเวลาเป็น ISO string พร้อม offset ไทย

    งานที่ไม่ระบุเวลาใช้ 00:00:00 ถึง 23:59:59 เหมือนที่ฟอร์มสาธารณะทำ เพื่อให้ทั้งสองทาง
    เก็บข้อมูลรูปแบบเดียวกัน — ตัวกรอง "งานที่ยังไม่จบ" จึงทำงานเหมือนกันไม่ว่างานมาจากไหน
  */
  const startAt = isAllDay
    ? `${startDate}T00:00:00${BANGKOK_OFFSET}`
    : `${startDate}T${startTime.slice(0, 5)}:00${BANGKOK_OFFSET}`;

  const endAt = isAllDay
    ? `${endDate}T23:59:59${BANGKOK_OFFSET}`
    : `${endDate}T${endTime.slice(0, 5)}:00${BANGKOK_OFFSET}`;

  return {
    ok: true,
    value: {
      id: orNull(id),
      title,
      description,
      category,
      province,
      district: orNull(district),
      venueName,
      address: orNull(address),
      mapLink,
      startAt,
      endAt,
      isAllDay,
      isFree,
      // งานเข้าฟรีต้องล้างราคาทิ้ง ไม่ใช่เก็บตัวเลขที่ผู้ใช้พิมพ์ค้างไว้ก่อนติ๊กช่องเข้าฟรี
      // ไม่งั้นหน้าเว็บจะแสดง "เข้าฟรี" แต่ข้อมูลข้างในมีราคาซ่อนอยู่ ซึ่งขัดกันเอง
      priceMin: isFree ? null : priceMin,
      priceMax: isFree ? null : priceMax,
      ticketUrl: orNull(ticketUrl),
      organizerName: orNull(organizerName),
      contact: orNull(contact),
      sourceUrl: orNull(sourceUrl),
      status,
      coverImage: toValidCoverImage(coverFile),
    },
  };
}

/** สถานะทั้งหมดที่ฟอร์มให้เลือก เรียงตามลำดับที่ใช้งานจริง */
export const STATUS_OPTIONS: readonly SelectableStatus[] = SELECTABLE_STATUSES;

/** true เมื่อค่านี้เป็นสถานะที่ฟอร์มรับได้ — ใช้ตรวจค่าจาก URL ในหน้ารายการด้วย */
export function toSelectableStatus(value: string | undefined): SelectableStatus | null {
  return value && isSelectableStatus(value) ? value : null;
}

/** ตรวจว่าเป็นสถานะที่ฐานข้อมูลรู้จัก — ใช้กับค่าที่อ่านกลับมาจาก DB */
export function isEventStatus(value: string): value is EventStatus {
  return ["draft", "pending", "approved", "rejected", "archived"].includes(value);
}
