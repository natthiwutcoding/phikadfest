"use server";

import { getCategory } from "@/lib/data/categories";
import { getProvince } from "@/lib/data/provinces";
import { USING_SAMPLE_DATA } from "@/lib/events";
import type { SubmitState } from "@/lib/form-state";
import { createEventSlug } from "@/lib/slug";
import { createSupabaseAdminClient, SERVICE_ROLE_CONFIGURED } from "@/lib/supabase/admin";

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

  if (!SERVICE_ROLE_CONFIGURED) {
    console.error("[submit] ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY");
    return {
      status: "error",
      message: "ระบบรับแจ้งงานยังไม่พร้อมใช้งาน กรุณาแจ้งทีมงาน",
    };
  }

  // ผ่าน validation แล้ว — ทั้งสองค่านี้ยืนยันแล้วว่ามีอยู่จริง
  const province = getProvince(provinceSlug)!;
  const category = getCategory(categorySlug)!;

  /*
    ฟอร์มสาธารณะรับแค่วันที่ ไม่รับเวลา จึงบันทึกเป็นงานแบบ "ไม่ระบุเวลา" (is_all_day)
    และตรึงเวลาเป็นเขตเวลาไทยชัดเจน ไม่ปล่อยให้ Postgres ตีความเป็น UTC
    ซึ่งจะทำให้วันคลาดไปหนึ่งวันสำหรับผู้ใช้ในไทย
  */
  const startAt = `${startDate}T00:00:00+07:00`;
  const endAt = `${endDate || startDate}T23:59:59+07:00`;

  /*
    ใช้ client ที่ข้าม RLS เพราะผู้แจ้งงานไม่ได้ล็อกอิน
    ปลอดภัยเพราะโค้ดถึงจุดนี้ได้ก็ต่อเมื่อผ่าน validation ข้างบนครบแล้ว
    และค่าที่ตัดสินสิทธิ์ (status, submitted_by) ถูกกำหนดตายตัวในโค้ด ไม่ได้มาจากผู้ใช้
  */
  const supabase = createSupabaseAdminClient();

  const { error } = await supabase.from("events").insert({
    slug: createEventSlug(title),
    title,
    description,
    category_id: category.id,
    province_id: province.id,
    venue_name: venueName,
    start_at: startAt,
    end_at: endAt,
    is_all_day: true,
    organizer_contact: contact,
    source_url: sourceUrl || null,
    // สองค่านี้ต้องตรงกับที่ RLS policy กำหนดไว้ ไม่งั้นฐานข้อมูลจะปฏิเสธ
    status: "pending",
    submitted_by: null,
  });

  if (error) {
    console.error("[submit] บันทึกงานไม่สำเร็จ:", error.message);
    return {
      status: "error",
      message: "บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง หากยังไม่ได้กรุณาแจ้งทีมงาน",
    };
  }

  return {
    status: "success",
    message:
      "ส่งข้อมูลเรียบร้อยแล้ว ขอบคุณมากครับ — ทีมงานจะตรวจสอบก่อนเผยแพร่ ปกติใช้เวลาไม่เกิน 2 วัน",
  };
}
