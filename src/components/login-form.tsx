"use client";

import { useActionState } from "react";

import { login } from "@/app/(site)/login/actions";
import { INITIAL_LOGIN_STATE } from "@/lib/form-state";

const fieldClass =
  "mt-1 min-h-11 w-full rounded-lg border border-line bg-background px-3 py-2 outline-none focus:border-brand-500";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(login, INITIAL_LOGIN_STATE);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      {/* พาปลายทางเดิมไปด้วย เพื่อให้ล็อกอินเสร็จแล้วกลับไปหน้าที่ตั้งใจจะไป */}
      <input type="hidden" name="next" value={next} />

      {state.status === "error" ? (
        <p
          role="alert"
          className="rounded-xl border border-red-900 bg-red-950/50 p-4 text-sm text-red-100"
        >
          {state.message}
        </p>
      ) : null}

      <label className="block">
        <span className="font-medium">อีเมล</span>
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          className={fieldClass}
        />
      </label>

      <label className="block">
        <span className="font-medium">รหัสผ่าน</span>
        <input
          type="password"
          name="password"
          required
          autoComplete="current-password"
          className={fieldClass}
        />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="glow-brand min-h-12 w-full rounded-xl bg-brand-600 font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
