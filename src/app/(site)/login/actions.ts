"use server";

import { redirect } from "next/navigation";

import { SUPABASE_CONFIGURED } from "@/lib/auth";
import type { LoginState } from "@/lib/form-state";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน
 *
 * เป็น Server Action ไม่ใช่ client-side call เพราะ Server Action เขียน cookie ได้
 * ต่างจาก Server Component — session จึงถูกบันทึกให้อัตโนมัติโดยไม่ต้องจัดการเอง
 */
export async function login(_prevState: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/admin");

  if (!SUPABASE_CONFIGURED) {
    return {
      status: "error",
      message: "ยังเข้าสู่ระบบไม่ได้ เพราะเว็บยังไม่ได้เชื่อมต่อฐานข้อมูล (โหมดพัฒนา)",
    };
  }

  if (!email || !password) {
    return { status: "error", message: "กรุณากรอกอีเมลและรหัสผ่าน" };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    // ไม่บอกว่า "ไม่พบอีเมลนี้" หรือ "รหัสผ่านผิด" แยกกัน
    // เพราะจะกลายเป็นช่องให้เดาว่าอีเมลไหนมีบัญชีอยู่ในระบบบ้าง
    return { status: "error", message: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" };
  }

  // ป้องกัน open redirect — ยอมเฉพาะ path ภายในเว็บเท่านั้น
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/admin");
}

export async function logout() {
  if (SUPABASE_CONFIGURED) {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
  }
  redirect("/");
}
