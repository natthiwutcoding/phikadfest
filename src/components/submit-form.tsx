"use client";

import { useActionState } from "react";

import { INITIAL_SUBMIT_STATE, submitEvent } from "@/app/(site)/submit/actions";
import { CATEGORIES } from "@/lib/data/categories";
import { PROVINCES_BY_REGION } from "@/lib/data/provinces";

// min-h-11 (44px) คือความสูงขั้นต่ำที่กดง่ายด้วยนิ้วบนจอมือถือ ตามมาตรฐาน Apple/Google
const fieldClass =
  "mt-1 min-h-11 w-full rounded-lg border border-line bg-background px-3 py-2 outline-none focus:border-brand-500";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-sm text-red-400" role="alert">
      {message}
    </p>
  );
}

export function SubmitForm() {
  const [state, formAction, pending] = useActionState(submitEvent, INITIAL_SUBMIT_STATE);
  const errors = state.errors ?? {};

  return (
    <form action={formAction} className="mt-6 space-y-5">
      {state.status === "error" && state.message ? (
        <p
          role="alert"
          className="rounded-xl border border-red-900 bg-red-950/50 p-4 text-sm text-red-100"
        >
          {state.message}
        </p>
      ) : null}

      {state.status === "success" ? (
        <p
          role="status"
          className="rounded-xl border border-emerald-900 bg-emerald-950/50 p-4 text-sm text-emerald-100"
        >
          {state.message}
        </p>
      ) : null}

      <label className="block">
        <span className="font-medium">ชื่องาน *</span>
        <input name="title" required maxLength={200} className={fieldClass} />
        <FieldError message={errors.title} />
      </label>

      <label className="block">
        <span className="font-medium">รายละเอียดงาน *</span>
        <textarea
          name="description"
          required
          rows={5}
          placeholder="มีอะไรในงานบ้าง เหมาะกับใคร ต้องเตรียมอะไรไปไหม"
          className={fieldClass}
        />
        <FieldError message={errors.description} />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="font-medium">หมวดหมู่ *</span>
          <select name="category" required defaultValue="" className={fieldClass}>
            <option value="" disabled>
              เลือกหมวดหมู่
            </option>
            {CATEGORIES.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.emoji} {category.nameTh}
              </option>
            ))}
          </select>
          <FieldError message={errors.category} />
        </label>

        <label className="block">
          <span className="font-medium">จังหวัด *</span>
          <select name="province" required defaultValue="" className={fieldClass}>
            <option value="" disabled>
              เลือกจังหวัด
            </option>
            {PROVINCES_BY_REGION.map((group) => (
              <optgroup key={group.region} label={group.label}>
                {group.provinces.map((province) => (
                  <option key={province.slug} value={province.slug}>
                    {province.nameTh}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <FieldError message={errors.province} />
        </label>
      </div>

      <label className="block">
        <span className="font-medium">สถานที่จัดงาน *</span>
        <input
          name="venueName"
          required
          placeholder="เช่น ลานหน้าศาลากลางจังหวัด"
          className={fieldClass}
        />
        <FieldError message={errors.venueName} />
      </label>

      <div className="grid gap-5 sm:grid-cols-2">
        <label className="block">
          <span className="font-medium">วันที่เริ่ม *</span>
          <input type="date" name="startDate" required className={fieldClass} />
          <FieldError message={errors.startDate} />
        </label>

        <label className="block">
          <span className="font-medium">วันที่สิ้นสุด</span>
          <input type="date" name="endDate" className={fieldClass} />
          <FieldError message={errors.endDate} />
        </label>
      </div>

      <label className="block">
        <span className="font-medium">ช่องทางติดต่อผู้จัด *</span>
        <input
          name="contact"
          required
          placeholder="เบอร์โทร เพจ Facebook หรือ LINE ID"
          className={fieldClass}
        />
        <span className="mt-1 block text-sm text-muted">
          ใช้สำหรับให้ทีมงานตรวจสอบข้อมูลก่อนเผยแพร่ ไม่แสดงบนหน้าเว็บ
        </span>
        <FieldError message={errors.contact} />
      </label>

      <label className="block">
        <span className="font-medium">ลิงก์ประกาศงาน</span>
        <input
          name="sourceUrl"
          type="url"
          placeholder="https://facebook.com/..."
          className={fieldClass}
        />
        <FieldError message={errors.sourceUrl} />
      </label>

      <button
        type="submit"
        disabled={pending}
        className="glow-brand min-h-12 rounded-xl bg-brand-600 px-6 font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "กำลังส่ง…" : "ส่งข้อมูลงาน"}
      </button>
    </form>
  );
}
