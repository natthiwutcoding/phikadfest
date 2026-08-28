"use server";

import { getCategory } from "@/lib/data/categories";
import { getProvince } from "@/lib/data/provinces";
import { USING_SAMPLE_DATA } from "@/lib/events";

export interface SubmitState {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: Record<string, string>;
}

export const INITIAL_SUBMIT_STATE: SubmitState = { status: "idle" };

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/**
 * รับงานที่ผู้ใช้ส่งเข้ามา
 *
 * ตรวจสอบฝั่งเซิร์ฟเวอร์เสมอ ไม่พึ่ง validation ของ HTML อย่างเดียว
 * เพราะ attribute เช่น required/minlength ถูกข้ามได้ง่ายด้วยการยิง request ตรง
 *
 * ทุกงานที่ส่งเข้ามาต้องมีสถานะ 'pending' เท่านั้น รอแอดมินอนุมัติก่อนขึ้นเว็บ
 * (บังคับซ้ำอีกชั้นด้วย RLS policy ใน supabase/migrations/0001_init.sql)
 */
export async function submitEvent(
  _prevState: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const errors: Record<string, string> = {};

  const title = text(formData, "title");
  const description = text(formData, "description");
  const categorySlug = text(formData, "category");
  const provinceSlug = text(formData, "province");
  const venueName = text(formData, "venueName");
  const startDate = text(formData, "startDate");
  const endDate = text(formData, "endDate");
  const contact = text(formData, "contact");
  const sourceUrl = text(formData, "sourceUrl");

  if (title.length < 5) errors.title = "ใส่ชื่องานอย่างน้อย 5 ตัวอักษร";
  if (title.length > 200) errors.title = "ชื่องานยาวเกินไป (ไม่เกิน 200 ตัวอักษร)";

  if (description.length < 20) {
    errors.description = "อธิบายรายละเอียดงานอย่างน้อย 20 ตัวอักษร เพื่อให้คนอ่านเข้าใจว่างานเป็นยังไง";
  }

  if (!getCategory(categorySlug)) errors.category = "เลือกหมวดหมู่งาน";
  if (!getProvince(provinceSlug)) errors.province = "เลือกจังหวัดที่จัดงาน";
  if (venueName.length < 3) errors.venueName = "ระบุชื่อสถานที่จัดงาน";

  if (!startDate) {
    errors.startDate = "เลือกวันที่เริ่มงาน";
  } else {
    // เทียบกับ "เมื่อวาน" ไม่ใช่ "ตอนนี้" เผื่องานที่กำลังจัดอยู่วันนี้
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    if (startDate < yesterday) errors.startDate = "วันที่เริ่มงานผ่านมาแล้ว";
  }

  if (endDate && startDate && endDate < startDate) {
    errors.endDate = "วันสิ้นสุดต้องไม่มาก่อนวันเริ่มงาน";
  }

  if (contact.length < 5) {
    errors.contact = "ใส่ช่องทางติดต่อผู้จัด เพื่อให้ทีมงานตรวจสอบข้อมูลได้";
  }

  if (sourceUrl) {
    try {
      const url = new URL(sourceUrl);
      if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error();
    } catch {
      errors.sourceUrl = "ลิงก์ไม่ถูกต้อง ใส่ให้ขึ้นต้นด้วย https://";
    }
  }

  if (Object.keys(errors).length > 0) {
    return { status: "error", message: "กรุณาตรวจสอบข้อมูลที่กรอก", errors };
  }

  if (USING_SAMPLE_DATA) {
    // ยังไม่ได้ต่อฐานข้อมูล — บอกตรงๆ ว่าไม่ได้บันทึก ดีกว่าแสดงว่าสำเร็จแล้วข้อมูลหาย
    console.info("[submit] ได้รับข้อมูลงาน แต่ยังไม่ได้บันทึก (ยังไม่ได้ตั้งค่า Supabase):", {
      title,
      provinceSlug,
      startDate,
    });

    return {
      status: "error",
      message:
        "ยังบันทึกไม่ได้ เพราะเว็บยังไม่ได้เชื่อมต่อฐานข้อมูล (โหมดพัฒนา) — ดูขั้นตอนตั้งค่าใน docs/03-data-model.md",
    };
  }

  // TODO(Supabase): insert เข้าตาราง events ด้วย status 'pending'
  // ดูโครงสร้างคอลัมน์ใน supabase/migrations/0001_init.sql
  throw new Error("ยังไม่ได้เขียนโค้ดบันทึกลง Supabase");
}
