"use server";

import { getCategory } from "@/lib/data/categories";
import { getProvince } from "@/lib/data/provinces";
import { USING_SAMPLE_DATA } from "@/lib/events";
import type { SubmitState } from "@/lib/form-state";
import { pointMatchesProvince } from "@/lib/map-camera";
import { resolveMapLink } from "@/lib/map-link";
import { ACTIVE_REGION_LABEL, isProvinceInScope } from "@/lib/region-scope";
import { createEventSlug } from "@/lib/slug";
import { createSupabaseAdminClient, SERVICE_ROLE_CONFIGURED } from "@/lib/supabase/admin";

function text(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

/** ชนิดไฟล์รูปที่รับ — ต้องตรงกับ allowed_mime_types ของ bucket ใน migration 0004 */
const COVER_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** เพดานขนาดไฟล์รูป — ต้องตรงกับ file_size_limit ของ bucket ใน migration 0004 */
const COVER_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const COVER_BUCKET = "event-covers";

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
  const mapLink = text(formData, "mapLink");

  /*
    ช่องรูปไม่บังคับ — เบราว์เซอร์ส่ง File ที่ size เป็น 0 มาให้เสมอแม้ผู้ใช้ไม่ได้เลือกไฟล์
    จึงต้องเช็ค size > 0 ด้วย ไม่ใช่แค่ instanceof File
  */
  const rawCover = formData.get("coverImage");
  const coverImage = rawCover instanceof File && rawCover.size > 0 ? rawCover : null;

  if (coverImage) {
    if (!COVER_IMAGE_TYPES[coverImage.type]) {
      errors.coverImage = "รองรับเฉพาะไฟล์ JPG PNG และ WebP";
    } else if (coverImage.size > COVER_IMAGE_MAX_BYTES) {
      errors.coverImage = "ไฟล์ใหญ่เกินไป ต้องไม่เกิน 5MB";
    }
  }

  if (title.length < 5) errors.title = "ใส่ชื่องานอย่างน้อย 5 ตัวอักษร";
  if (title.length > 200) errors.title = "ชื่องานยาวเกินไป (ไม่เกิน 200 ตัวอักษร)";

  if (description.length < 20) {
    errors.description = "อธิบายรายละเอียดงานอย่างน้อย 20 ตัวอักษร เพื่อให้คนอ่านเข้าใจว่างานเป็นยังไง";
  }

  if (!getCategory(categorySlug)) errors.category = "เลือกหมวดหมู่งาน";

  /*
    ต้องตรวจ "อยู่ในภาคที่เปิดรับ" ที่ฝั่งเซิร์ฟเวอร์ด้วย ไม่ใช่พึ่งแค่ dropdown ที่กรองไว้แล้ว
    เพราะ dropdown เป็นแค่ HTML ที่แก้ได้จากฝั่งผู้ใช้ ยิง request ตรงมาเลือกจังหวัดไหนก็ได้
    (หลักเดียวกับที่ไฟล์นี้ยึดอยู่แล้วเรื่อง required/minlength)
  */
  if (!getProvince(provinceSlug)) {
    errors.province = "เลือกจังหวัดที่จัดงาน";
  } else if (!isProvinceInScope(provinceSlug)) {
    errors.province = `ตอนนี้เปิดรับเฉพาะงานใน${ACTIVE_REGION_LABEL}`;
  }
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
    ลิงก์แผนที่ไม่บังคับ และตั้งใจไม่ให้ทำทั้งฟอร์มพังถ้าแปลงไม่ได้
    เพราะงานที่ไม่มีพิกัดก็ยังมีประโยชน์ (นับรวมในสีจังหวัดบนแผนที่ได้)
    ดีกว่าปฏิเสธทั้งใบเพราะลิงก์ที่เป็นแค่ข้อมูลเสริม
  */
  let lat: number | null = null;
  let lng: number | null = null;

  if (mapLink) {
    const resolved = await resolveMapLink(mapLink);

    if (resolved.ok) {
      /*
        ค้านเมื่อพิกัดไม่เข้ากับจังหวัดที่เลือก — มักเกิดจากก๊อปลิงก์ผิดที่

        ห้ามเทียบ resolved.province ตรงๆ เพราะค่านั้นหาจากระยะถึงตัวเมือง ซึ่งตอบผิด
        สำหรับพัทยา จอมเทียน และสัตหีบ (อยู่ชลบุรี แต่ใกล้ตัวเมืองระยองมากกว่า)
        — คือสถานที่จัดงานที่คนแจ้งเข้ามาบ่อยที่สุดในภาคนี้ ดูรายละเอียดใน pointMatchesProvince()
      */
      if (!pointMatchesProvince(province.code, resolved.lat, resolved.lng)) {
        return {
          status: "error",
          message: `ลิงก์แผนที่ชี้ไปที่${resolved.province.nameTh} แต่เลือกจังหวัดเป็น${province.nameTh} — ตรวจสอบอีกครั้ง`,
          errors: { mapLink: `พิกัดในลิงก์อยู่ใน${resolved.province.nameTh}` },
        };
      }

      lat = resolved.lat;
      lng = resolved.lng;
    } else {
      return {
        status: "error",
        message: "ลิงก์แผนที่ใช้ไม่ได้",
        errors: { mapLink: resolved.reason },
      };
    }
  }

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

  /*
    อัปโหลดรูปปก (ถ้ามี)

    ตั้งใจให้ล้มเหลวแบบไม่ทำให้ทั้งฟอร์มพัง — งานที่ไม่มีรูปก็ยังมีประโยชน์เต็มที่
    การ์ดมีภาพประกอบสำรองอยู่แล้ว จึงไม่คุ้มที่จะทิ้งข้อมูลงานที่กรอกมาครบ
    เพราะ Storage มีปัญหาชั่วคราว
  */
  let coverImageUrl: string | null = null;

  if (coverImage) {
    const extension = COVER_IMAGE_TYPES[coverImage.type];
    // ชื่อไฟล์สุ่มจากฝั่งเซิร์ฟเวอร์ ไม่เอาชื่อเดิมของผู้ใช้มาใช้
    // เพราะชื่อไฟล์ที่ผู้ใช้ตั้งอาจมีอักขระที่ทำให้ path เพี้ยน หรือชนกันเองได้
    const path = `${crypto.randomUUID()}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(COVER_BUCKET)
      .upload(path, coverImage, { contentType: coverImage.type });

    if (uploadError) {
      console.error("[submit] อัปโหลดรูปปกไม่สำเร็จ:", uploadError.message);
    } else {
      coverImageUrl = supabase.storage.from(COVER_BUCKET).getPublicUrl(path).data.publicUrl;
    }
  }

  const { error } = await supabase.from("events").insert({
    slug: createEventSlug(title),
    title,
    description,
    category_id: category.id,
    province_id: province.id,
    venue_name: venueName,
    lat,
    lng,
    cover_image_url: coverImageUrl,
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
