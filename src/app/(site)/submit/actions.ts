"use server";

import { USING_SAMPLE_DATA } from "@/lib/events";
import type { SubmitState } from "@/lib/form-state";
import { pointMatchesProvince } from "@/lib/map-camera";
import { resolveMapLink } from "@/lib/map-link";
import { createEventSlug } from "@/lib/slug";
import { validateSubmission, type ValidSubmission } from "@/lib/submit-validation";
import { createSupabaseAdminClient, SERVICE_ROLE_CONFIGURED } from "@/lib/supabase/admin";

const COVER_BUCKET = "event-covers";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

/**
 * แปลงลิงก์แผนที่เป็นพิกัด
 *
 * ตั้งใจไม่ให้ทำทั้งฟอร์มพังถ้าไม่ได้ใส่ลิงก์มา เพราะงานที่ไม่มีพิกัดก็ยังมีประโยชน์
 * (นับรวมในสีจังหวัดบนแผนที่ได้) แต่ถ้า *ใส่มาแล้วผิด* ต้องบอกให้แก้ ไม่ใช่เงียบแล้วทิ้ง
 */
async function resolveEventLocation(
  submission: ValidSubmission,
): Promise<{ ok: true; lat: number | null; lng: number | null } | { ok: false; state: SubmitState }> {
  if (!submission.mapLink) return { ok: true, lat: null, lng: null };

  const resolved = await resolveMapLink(submission.mapLink);

  if (!resolved.ok) {
    return {
      ok: false,
      state: {
        status: "error",
        message: "ลิงก์แผนที่ใช้ไม่ได้",
        errors: { mapLink: resolved.reason },
      },
    };
  }

  /*
    ค้านเมื่อพิกัดไม่เข้ากับจังหวัดที่เลือก — มักเกิดจากก๊อปลิงก์ผิดที่

    ห้ามเทียบ resolved.province ตรงๆ เพราะค่านั้นหาจากระยะถึงตัวเมือง ซึ่งตอบผิด
    สำหรับพัทยา จอมเทียน และสัตหีบ (อยู่ชลบุรี แต่ใกล้ตัวเมืองระยองมากกว่า)
    — คือสถานที่จัดงานที่คนแจ้งเข้ามาบ่อยที่สุดในภาคนี้ ดูรายละเอียดใน pointMatchesProvince()
  */
  if (!pointMatchesProvince(submission.province.code, resolved.lat, resolved.lng)) {
    return {
      ok: false,
      state: {
        status: "error",
        message: `ลิงก์แผนที่ชี้ไปที่${resolved.province.nameTh} แต่เลือกจังหวัดเป็น${submission.province.nameTh} — ตรวจสอบอีกครั้ง`,
        errors: { mapLink: `พิกัดในลิงก์อยู่ใน${resolved.province.nameTh}` },
      },
    };
  }

  return { ok: true, lat: resolved.lat, lng: resolved.lng };
}

/**
 * อัปโหลดรูปปกขึ้น Storage แล้วคืน URL สาธารณะ
 *
 * ตั้งใจให้ล้มเหลวแบบไม่ทำให้ทั้งฟอร์มพัง — งานที่ไม่มีรูปก็ยังมีประโยชน์เต็มที่
 * การ์ดมีภาพประกอบสำรองอยู่แล้ว จึงไม่คุ้มที่จะทิ้งข้อมูลงานที่กรอกมาครบ
 * เพราะ Storage มีปัญหาชั่วคราว
 */
async function uploadCoverImage(
  supabase: AdminClient,
  cover: NonNullable<ValidSubmission["coverImage"]>,
): Promise<string | null> {
  // ชื่อไฟล์สุ่มจากฝั่งเซิร์ฟเวอร์ ไม่เอาชื่อเดิมของผู้ใช้มาใช้
  // เพราะชื่อไฟล์ที่ผู้ใช้ตั้งอาจมีอักขระที่ทำให้ path เพี้ยน หรือชนกันเองได้
  const path = `${crypto.randomUUID()}.${cover.extension}`;

  const { error } = await supabase.storage
    .from(COVER_BUCKET)
    .upload(path, cover.file, { contentType: cover.file.type });

  if (error) {
    console.error("[submit] อัปโหลดรูปปกไม่สำเร็จ:", error.message);
    return null;
  }

  return supabase.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
}

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

  const location = await resolveEventLocation(submission);
  if (!location.ok) return location.state;

  /*
    ใช้ client ที่ข้าม RLS เพราะผู้แจ้งงานไม่ได้ล็อกอิน
    ปลอดภัยเพราะโค้ดถึงจุดนี้ได้ก็ต่อเมื่อผ่าน validation ข้างบนครบแล้ว
    และค่าที่ตัดสินสิทธิ์ (status, submitted_by) ถูกกำหนดตายตัวในโค้ด ไม่ได้มาจากผู้ใช้
  */
  const supabase = createSupabaseAdminClient();

  const coverImageUrl = submission.coverImage
    ? await uploadCoverImage(supabase, submission.coverImage)
    : null;

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

  return {
    status: "success",
    message:
      "ส่งข้อมูลเรียบร้อยแล้ว ขอบคุณมากครับ — ทีมงานจะตรวจสอบก่อนเผยแพร่ ปกติใช้เวลาไม่เกิน 2 วัน",
  };
}
