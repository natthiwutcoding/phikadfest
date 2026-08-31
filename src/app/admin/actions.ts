"use server";

import { revalidatePath } from "next/cache";

import { requireAdmin } from "@/lib/auth";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * อนุมัติหรือปฏิเสธงานที่ส่งเข้ามา
 *
 * requireAdmin() เป็นการป้องกันชั้นที่หนึ่ง ส่วนชั้นที่สองคือ RLS policy `is_admin()`
 * ที่ฐานข้อมูล ซึ่งจะปฏิเสธคำสั่งนี้เองแม้โค้ดตรงนี้จะพลาด
 * — ป้องกันสองชั้นเพราะการอนุมัติงานคือสิ่งที่ตัดสินว่าอะไรจะขึ้นหน้าเว็บสาธารณะ
 */
export async function reviewEvent(formData: FormData) {
  const session = await requireAdmin();

  const eventId = String(formData.get("eventId") ?? "");
  const decision = String(formData.get("decision") ?? "");

  if (!eventId || (decision !== "approved" && decision !== "rejected")) {
    throw new Error("คำสั่งไม่ถูกต้อง");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("events")
    .update({
      status: decision,
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", eventId);

  if (error) {
    console.error("[admin] อัปเดตสถานะงานไม่สำเร็จ:", error.message);
    throw new Error("บันทึกไม่สำเร็จ");
  }

  // ล้าง cache ของหน้าที่แสดงรายการงาน เพื่อให้เห็นผลทันที
  revalidatePath("/admin");
  revalidatePath("/events");
  revalidatePath("/map");
  revalidatePath("/");
}
