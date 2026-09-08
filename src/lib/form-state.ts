import type { AdminEventErrors } from "@/lib/admin-event-validation";
import type { SubmitErrors } from "@/lib/submit-validation";

/**
 * สถานะของฟอร์มที่ใช้กับ useActionState
 *
 * แยกออกมาจากไฟล์ที่มี "use server" เพราะไฟล์เหล่านั้น export ได้เฉพาะ async function เท่านั้น
 * ถ้าใส่ค่าคงที่ไว้ในนั้นจะ build ไม่ผ่าน (invalid-use-server-value)
 */

export interface SubmitState {
  status: "idle" | "success" | "error";
  message?: string;
  /**
   * ข้อความ error รายช่อง key คือ name ของ input
   *
   * เป็น union ของชื่อช่องจริง ไม่ใช่ string ทั่วไป — คำสะกดผิดอย่าง `errors.tittle`
   * จึงพังตั้งแต่ตอน build แทนที่จะกลายเป็น error ที่ไม่มีวันแสดงบนหน้าจอ
   */
  errors?: SubmitErrors;
}

export const INITIAL_SUBMIT_STATE: SubmitState = { status: "idle" };

export interface LoginState {
  status: "idle" | "error";
  message?: string;
}

export const INITIAL_LOGIN_STATE: LoginState = { status: "idle" };

/** สถานะของฟอร์มจัดการงานในหน้าแอดมิน */
export interface AdminEventState {
  status: "idle" | "success" | "error";
  message?: string;
  errors?: AdminEventErrors;
  /** slug ของงานที่เพิ่งบันทึก — ใช้ทำลิงก์ไปดูหน้าจริงหลังบันทึกสำเร็จ */
  savedSlug?: string;
}

export const INITIAL_ADMIN_EVENT_STATE: AdminEventState = { status: "idle" };
