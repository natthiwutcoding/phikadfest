/**
 * สถานะของฟอร์มที่ใช้กับ useActionState
 *
 * แยกออกมาจากไฟล์ที่มี "use server" เพราะไฟล์เหล่านั้น export ได้เฉพาะ async function เท่านั้น
 * ถ้าใส่ค่าคงที่ไว้ในนั้นจะ build ไม่ผ่าน (invalid-use-server-value)
 */

export interface SubmitState {
  status: "idle" | "success" | "error";
  message?: string;
  /** ข้อความ error รายช่อง key คือ name ของ input */
  errors?: Record<string, string>;
}

export const INITIAL_SUBMIT_STATE: SubmitState = { status: "idle" };

export interface LoginState {
  status: "idle" | "error";
  message?: string;
}

export const INITIAL_LOGIN_STATE: LoginState = { status: "idle" };
