"use server";

import { uploadCoverImage } from "@/lib/cover-image";
import { resolveEventCoordinates } from "@/lib/event-location";
import { USING_SAMPLE_DATA } from "@/lib/events";
import type { SubmitState } from "@/lib/form-state";
import { revalidateEventPages } from "@/lib/revalidate-events";
import { createEventSlug } from "@/lib/slug";
import { validateSubmission } from "@/lib/submit-validation";
import { createSupabaseAdminClient, SERVICE_ROLE_CONFIGURED } from "@/lib/supabase/admin";

/**
 * รับงานที่ผู้ใช้ส่งเข้ามา
 *
 * ตรวจสอบฝั่งเซิร์ฟเวอร์เสมอ ไม่พึ่ง validation ของ HTML อย่างเดียว
 * เพราะ attribute เช่น required/minlength ถูกข้ามได้ง่ายด้วยการยิง request ตรง
 * (ตัวตรวจอยู่ที่ `lib/submit-validation.ts` — แยกไว้เพราะเป็นตรรกะบริสุทธิ์ที่ทดสอบได้)
 *
 * ทุกงานที่ส่งเข้ามาต้องมีสถานะ 'pending' เท่านั้น รอแอดมินอนุมัติก่อนขึ้นเว็บ
 * (บังคับซ้ำอีกชั้นด้วย RLS policy ใน supabase/migrations/0001_init.sql)
 */
export async function submitEvent(
  _prevState: SubmitState,
  formData: FormData,
): Promise<SubmitState> {
  const validation = validateSubmission(formData);

  if (!validation.ok) {
    return { status: "error", message: "กรุณาตรวจสอบข้อมูลที่กรอก", errors: validation.errors };
  }

  const submission = validation.value;

  if (USING_SAMPLE_DATA) {
    // ยังไม่ได้ต่อฐานข้อมูล — บอกตรงๆ ว่าไม่ได้บันทึก ดีกว่าแสดงว่าสำเร็จแล้วข้อมูลหาย
    console.info("[submit] ได้รับข้อมูลงาน แต่ยังไม่ได้บันทึก (ยังไม่ได้ตั้งค่า Supabase):", {
      title: submission.title,
      provinceSlug: submission.province.slug,
      startDate: submission.startDate,
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

  const location = await resolveEventCoordinates(submission.mapLink, submission.province);
  if (!location.ok) {
    return {
      status: "error",
      message: location.message,
      errors: { mapLink: location.reason },
    };
  }

  const coverImageUrl = submission.coverImage
    ? await uploadCoverImage(submission.coverImage)
    : null;

  /*
    ใช้ client ที่ข้าม RLS เพราะผู้แจ้งงานไม่ได้ล็อกอิน
    ปลอดภัยเพราะโค้ดถึงจุดนี้ได้ก็ต่อเมื่อผ่าน validation ข้างบนครบแล้ว
    และค่าที่ตัดสินสิทธิ์ (status, submitted_by) ถูกกำหนดตายตัวในโค้ด ไม่ได้มาจากผู้ใช้
  */
  const supabase = createSupabaseAdminClient();

  /*
    ฟอร์มสาธารณะรับแค่วันที่ ไม่รับเวลา จึงบันทึกเป็นงานแบบ "ไม่ระบุเวลา" (is_all_day)
    และตรึงเวลาเป็นเขตเวลาไทยชัดเจน ไม่ปล่อยให้ Postgres ตีความเป็น UTC
    ซึ่งจะทำให้วันคลาดไปหนึ่งวันสำหรับผู้ใช้ในไทย
  */
  const { error } = await supabase.from("events").insert({
    slug: createEventSlug(submission.title),
    title: submission.title,
    description: submission.description,
    category_id: submission.category.id,
    province_id: submission.province.id,
    venue_name: submission.venueName,
    lat: location.lat,
    lng: location.lng,
    cover_image_url: coverImageUrl,
    start_at: `${submission.startDate}T00:00:00+07:00`,
    end_at: `${submission.endDate}T23:59:59+07:00`,
    is_all_day: true,
    organizer_contact: submission.contact,
    source_url: submission.sourceUrl || null,
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

  // งานใหม่ยังไม่ขึ้นหน้าสาธารณะ (รออนุมัติ) แต่คิวตรวจของแอดมินต้องเห็นทันที
  revalidateEventPages();

  return {
    status: "success",
    message:
      "ส่งข้อมูลเรียบร้อยแล้ว ขอบคุณมากครับ — ทีมงานจะตรวจสอบก่อนเผยแพร่ ปกติใช้เวลาไม่เกิน 2 วัน",
  };
}
