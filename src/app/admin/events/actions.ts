"use server";

import { validateAdminEvent, type ValidAdminEvent } from "@/lib/admin-event-validation";
import { requireAdmin } from "@/lib/auth";
import { uploadCoverImage } from "@/lib/cover-image";
import { resolveEventCoordinates } from "@/lib/event-location";
import { getAdminEvent } from "@/lib/events";
import type { AdminEventState } from "@/lib/form-state";
import { revalidateEventPages } from "@/lib/revalidate-events";
import { createEventSlug } from "@/lib/slug";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * เพิ่มและแก้ไขงานจากหน้าแอดมิน
 *
 * ── ทำไมไม่ใช้ service role เหมือนฟอร์มสาธารณะ ──
 * ฟอร์มสาธารณะต้องบันทึกได้โดยผู้ใช้ไม่ได้ล็อกอิน จึงเลี่ยง RLS ไม่ได้ แต่แอดมินล็อกอินอยู่แล้ว
 * การเขียนผ่าน session จริงทำให้ policy `admins manage all events` เป็นด่านที่สอง —
 * ถ้าโค้ดตรงนี้พลาดปล่อยให้คนที่ไม่ใช่แอดมินเข้ามาถึง ฐานข้อมูลจะปฏิเสธเอง
 * (ยกเว้นการอัปโหลดรูปที่ bucket ไม่มี policy เขียนเลย จึงต้องใช้ service role — ดู lib/cover-image.ts)
 */

/** ค่าที่เขียนลงตาราง events — ตรงกับชื่อคอลัมน์จริง (snake_case) */
function toEventRow(event: ValidAdminEvent, lat: number | null, lng: number | null) {
  return {
    title: event.title,
    description: event.description,
    category_id: event.category.id,
    province_id: event.province.id,
    district: event.district,
    venue_name: event.venueName,
    address: event.address,
    lat,
    lng,
    start_at: event.startAt,
    end_at: event.endAt,
    is_all_day: event.isAllDay,
    ticket_url: event.ticketUrl,
    is_free: event.isFree,
    price_min: event.priceMin,
    price_max: event.priceMax,
    organizer_name: event.organizerName,
    organizer_contact: event.contact,
    source_url: event.sourceUrl,
    status: event.status,
  };
}

/**
 * ขั้นตอนที่ใช้ร่วมกันของทั้งเพิ่มและแก้ไข: ตรวจสิทธิ์ ตรวจข้อมูล แปลงลิงก์แผนที่ อัปโหลดรูป
 *
 * คืน state ที่พร้อมส่งกลับฟอร์มเมื่อมีอะไรผิด หรือคืนข้อมูลที่พร้อมเขียนลงฐานข้อมูลเมื่อผ่านครบ
 */
async function prepare(
  formData: FormData,
): Promise<
  | { ok: false; state: AdminEventState }
  | { ok: true; event: ValidAdminEvent; row: ReturnType<typeof toEventRow>; coverImageUrl: string | null }
> {
  // ตรวจสิทธิ์ก่อนแตะข้อมูลใดๆ เสมอ
  await requireAdmin();

  const validation = validateAdminEvent(formData);
  if (!validation.ok) {
    return {
      ok: false,
      state: { status: "error", message: "กรุณาตรวจสอบข้อมูลที่กรอก", errors: validation.errors },
    };
  }

  const event = validation.value;

  const location = await resolveEventCoordinates(event.mapLink, event.province);
  if (!location.ok) {
    return {
      ok: false,
      state: {
        status: "error",
        message: location.message,
        errors: { mapLink: location.reason },
      },
    };
  }

  const coverImageUrl = event.coverImage ? await uploadCoverImage(event.coverImage) : null;

  return {
    ok: true,
    event,
    row: toEventRow(event, location.lat, location.lng),
    coverImageUrl,
  };
}

/** เพิ่มงานใหม่ — slug สร้างจากชื่องานตอนนี้ครั้งเดียว แล้วอยู่กับงานนั้นตลอดไป */
export async function createAdminEvent(
  _prevState: AdminEventState,
  formData: FormData,
): Promise<AdminEventState> {
  const prepared = await prepare(formData);
  if (!prepared.ok) return prepared.state;

  const slug = createEventSlug(prepared.event.title);
  const supabase = await createSupabaseServerClient();

  const { error } = await supabase.from("events").insert({
    ...prepared.row,
    slug,
    cover_image_url: prepared.coverImageUrl,
  });

  if (error) {
    console.error("[admin] เพิ่มงานไม่สำเร็จ:", error.message);
    return { status: "error", message: `บันทึกไม่สำเร็จ: ${error.message}` };
  }

  revalidateEventPages(slug);

  return {
    status: "success",
    message: `บันทึก "${prepared.event.title}" แล้ว`,
    savedSlug: slug,
  };
}

/**
 * แก้ไขงานที่มีอยู่
 *
 * ⚠️ ตั้งใจไม่แตะ slug แม้ผู้ใช้จะแก้ชื่องาน
 * slug คือที่อยู่ถาวรของงานนั้น — ลิงก์ที่แชร์ไปแล้วใน LINE และอันดับที่ Google เก็บไว้
 * ผูกกับมันทั้งหมด การเปลี่ยน slug ตามชื่อจึงเท่ากับทำลิงก์เก่าพังทุกครั้งที่แก้คำผิด
 */
export async function updateAdminEvent(
  _prevState: AdminEventState,
  formData: FormData,
): Promise<AdminEventState> {
  const prepared = await prepare(formData);
  if (!prepared.ok) return prepared.state;

  const { event, row, coverImageUrl } = prepared;

  if (!event.id) {
    return { status: "error", message: "ไม่พบรหัสงานที่จะแก้ไข" };
  }

  const existing = await getAdminEvent(event.id);
  if (!existing) {
    return { status: "error", message: "ไม่พบงานนี้ในระบบ อาจถูกลบไปแล้ว" };
  }

  const supabase = await createSupabaseServerClient();

  const { error } = await supabase
    .from("events")
    .update({
      ...row,
      // ไม่ได้เลือกรูปใหม่ = คงรูปเดิมไว้ ไม่ใช่ล้างทิ้ง
      ...(coverImageUrl ? { cover_image_url: coverImageUrl } : {}),
    })
    .eq("id", event.id);

  if (error) {
    console.error("[admin] แก้ไขงานไม่สำเร็จ:", error.message);
    return { status: "error", message: `บันทึกไม่สำเร็จ: ${error.message}` };
  }

  revalidateEventPages(existing.slug);

  return {
    status: "success",
    message: `บันทึกการแก้ไข "${event.title}" แล้ว`,
    savedSlug: existing.slug,
  };
}
