import type { SelectableStatus } from "@/lib/admin-event-validation";
import { bangkokDay, bangkokTime } from "@/lib/format";
import type { AdminEvent } from "@/lib/types";

/**
 * ค่าของฟอร์มจัดการงานในหน้าแอดมิน
 *
 * ทุกช่องเป็นสตริง (ยกเว้น checkbox) เพราะเป็นค่าที่ใส่ลง input ได้ตรงๆ — การแปลงเป็น
 * ตัวเลขหรือ timestamp เกิดที่ฝั่งเซิร์ฟเวอร์ใน `lib/admin-event-validation.ts` ที่เดียว
 *
 * แยกไฟล์นี้ออกจากตัว component เพราะหน้าแก้ไข (Server Component) ต้องแปลงข้อมูล
 * จากฐานข้อมูลเป็นค่าฟอร์มก่อนส่งเข้า client — ถ้าตัวแปลงอยู่ในไฟล์ที่มี "use client"
 * จะลาก component ทั้งก้อนเข้าไปในฝั่งเซิร์ฟเวอร์โดยไม่จำเป็น
 */
export interface AdminEventFormValues {
  /** ว่างเมื่อเป็นงานใหม่ */
  id: string;
  title: string;
  description: string;
  category: string;
  province: string;
  district: string;
  venueName: string;
  address: string;
  mapLink: string;
  /** 'YYYY-MM-DD' */
  startDate: string;
  endDate: string;
  isAllDay: boolean;
  /** 'HH:MM' — ว่างได้เมื่อเป็นงานไม่ระบุเวลา */
  startTime: string;
  endTime: string;
  isFree: boolean;
  priceMin: string;
  priceMax: string;
  ticketUrl: string;
  organizerName: string;
  contact: string;
  sourceUrl: string;
  status: SelectableStatus;
}

/**
 * ฟอร์มเปล่าสำหรับงานใหม่
 *
 * ตั้งต้นเป็น "ไม่ระบุเวลา" และ "เข้าฟรี" เพราะเป็นกรณีที่พบบ่อยที่สุดของงานเทศกาลไทย
 * (งานวัด งานประจำปี ตลาดนัด) — คนกรอกจึงข้ามสองช่องนี้ได้เป็นส่วนใหญ่
 * สถานะตั้งต้นเป็น 'approved' เพราะงานที่แอดมินกรอกเองคือข้อมูลที่ตรวจแล้ว
 */
export const EMPTY_ADMIN_EVENT_FORM: AdminEventFormValues = {
  id: "",
  title: "",
  description: "",
  category: "",
  province: "",
  district: "",
  venueName: "",
  address: "",
  mapLink: "",
  startDate: "",
  endDate: "",
  isAllDay: true,
  startTime: "",
  endTime: "",
  isFree: true,
  priceMin: "",
  priceMax: "",
  ticketUrl: "",
  organizerName: "",
  contact: "",
  sourceUrl: "",
  status: "approved",
};

/** สถานะจากฐานข้อมูลที่ฟอร์มไม่มีให้เลือก จะถูกแสดงเป็นค่าที่ใกล้เคียงที่สุด */
function toSelectable(status: AdminEvent["status"]): SelectableStatus {
  return status === "archived" ? "rejected" : status;
}

/**
 * แปลงงานจากฐานข้อมูลเป็นค่าเริ่มต้นของฟอร์มแก้ไข
 *
 * วันและเวลาถูกแยกออกจากกันด้วยเขตเวลาไทยเสมอ ไม่ใช่เวลาของเครื่องที่รัน —
 * ไม่งั้นแอดมินจะเปิดฟอร์มมาเห็นเวลาคลาดจากที่ตัวเองกรอกไว้ แล้วเผลอบันทึกทับด้วยค่าที่ผิด
 */
export function toAdminEventFormValues(event: AdminEvent): AdminEventFormValues {
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    category: event.categorySlug,
    province: event.provinceSlug,
    district: event.district ?? "",
    venueName: event.venueName ?? "",
    address: event.address ?? "",
    // ลิงก์แผนที่ไม่ได้ถูกเก็บไว้ เก็บแต่พิกัดที่แปลงแล้ว — ปล่อยว่างไว้ให้กรอกใหม่ถ้าจะย้ายจุด
    mapLink: "",
    startDate: bangkokDay(event.startAt),
    endDate: bangkokDay(event.endAt),
    isAllDay: event.isAllDay,
    startTime: event.isAllDay ? "" : bangkokTime(event.startAt),
    endTime: event.isAllDay ? "" : bangkokTime(event.endAt),
    isFree: event.isFree,
    priceMin: event.priceMin?.toString() ?? "",
    priceMax: event.priceMax?.toString() ?? "",
    ticketUrl: event.ticketUrl ?? "",
    organizerName: event.organizerName ?? "",
    contact: event.organizerContact ?? "",
    sourceUrl: event.sourceUrl ?? "",
    status: toSelectable(event.status),
  };
}
