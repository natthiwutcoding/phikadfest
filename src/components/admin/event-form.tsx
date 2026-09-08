"use client";

import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import { createAdminEvent, updateAdminEvent } from "@/app/admin/events/actions";
import { DateRangePicker } from "@/components/date-range-picker";
import {
  STATUS_LABELS,
  STATUS_OPTIONS,
  type AdminEventField,
} from "@/lib/admin-event-validation";
import {
  EMPTY_ADMIN_EVENT_FORM,
  type AdminEventFormValues,
} from "@/lib/admin-event-form-values";
import { CATEGORIES } from "@/lib/data/categories";
import { INITIAL_ADMIN_EVENT_STATE } from "@/lib/form-state";
import { ACTIVE_PROVINCES } from "@/lib/region-scope";

/**
 * ฟอร์มเพิ่มและแก้ไขงานของแอดมิน
 *
 * ใช้ component เดียวทั้งสองหน้าเพราะช่องกรอกเหมือนกันหมด ต่างแค่ action ที่เรียก
 * และการจัดการหลังบันทึกสำเร็จ
 *
 * ── สิ่งที่ยืมมาจาก submit-form.tsx และห้ามเปลี่ยน ──
 * เก็บค่าทุกช่องไว้ใน state และเรียก action เองจาก onSubmit แทนการใช้ `action` prop
 * เพราะ React สั่ง reset ฟอร์มหลัง action ทำงานเสร็จเสมอ ซึ่งล้างค่าใน DOM ของ <select>
 * โดยไม่ sync กลับจาก value prop — หมวดหมู่กับจังหวัดจะหายทุกครั้งที่บันทึกไม่ผ่าน
 */

const fieldClass =
  "mt-1 min-h-11 w-full rounded-lg border border-line bg-background px-3 py-2 outline-none focus:border-brand-500";

const labelClass = "block text-sm";

/**
 * ลำดับช่องตามที่วางบนหน้าจอ — ใช้หาว่าควรพาผู้ใช้ไปแก้จุดไหนก่อน
 * (เหตุผลเดียวกับ FIELD_ORDER ใน submit-form.tsx: ห้ามใช้ลำดับคีย์ของ object errors)
 */
const FIELD_ORDER: readonly AdminEventField[] = [
  "title",
  "description",
  "category",
  "coverImage",
  "province",
  "district",
  "venueName",
  "address",
  "mapLink",
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "priceMin",
  "priceMax",
  "ticketUrl",
  "organizerName",
  "contact",
  "sourceUrl",
  "status",
];

/** ช่องที่เก็บค่าใน hidden input ซึ่งโฟกัสไม่ได้ ต้องเล็งไปที่ปุ่มเปิดปฏิทินแทน */
const DATE_FIELDS = new Set<AdminEventField>(["startDate", "endDate"]);

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1 text-sm text-red-400" role="alert">
      {message}
    </p>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <legend className="px-1 text-sm font-semibold text-muted">{title}</legend>
      <div className="mt-2 space-y-4">{children}</div>
    </fieldset>
  );
}

interface Props {
  mode: "create" | "edit";
  /** ค่าเริ่มต้นตอนแก้ไข — งานใหม่ใช้ฟอร์มเปล่า */
  defaultValues?: AdminEventFormValues;
}

export function AdminEventForm({ mode, defaultValues }: Props) {
  const action = mode === "create" ? createAdminEvent : updateAdminEvent;
  const [state, formAction, pending] = useActionState(action, INITIAL_ADMIN_EVENT_STATE);
  const errors = state.errors ?? {};

  const [fields, setFields] = useState<AdminEventFormValues>(
    defaultValues ?? EMPTY_ADMIN_EVENT_FORM,
  );

  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  /** พาไปยังช่องที่กรอกผิดทันทีที่เซิร์ฟเวอร์ตีกลับ — ฟอร์มนี้ยาวหลายจอ */
  useEffect(() => {
    if (state.status !== "error") return;

    const form = formRef.current;
    if (!form) return;

    const errorKeys = state.errors ?? {};
    const firstInvalid = FIELD_ORDER.find((name) => errorKeys[name]);

    const target = firstInvalid
      ? DATE_FIELDS.has(firstInvalid)
        ? form.querySelector<HTMLElement>('[aria-haspopup="dialog"]')
        : form.elements.namedItem(firstInvalid)
      : messageRef.current;

    if (!(target instanceof HTMLElement)) return;

    target.focus({ preventScroll: true });

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  }, [state]);

  /** ผลลัพธ์ครั้งล่าสุดที่จัดการไปแล้ว — กันไม่ให้ล้างฟอร์มซ้ำทุก render */
  const [handledResult, setHandledResult] = useState(state);

  /*
    บันทึกงานใหม่สำเร็จ = พร้อมกรอกงานถัดไปทันที

    คงจังหวัด หมวดหมู่ ช่วงวัน และรูปแบบเวลา/ราคาไว้ เพราะงานที่กรอกติดกันมักอยู่จังหวัด
    เดียวกันและช่วงเวลาใกล้กัน — การต้องเลือกใหม่ทุกครั้งคือส่วนที่ทำให้กรอกร้อยงานแล้วเหนื่อย
    (หน้าแก้ไขไม่ล้าง เพราะแอดมินมักแก้ต่ออีกหลายจุดในงานเดิม)

    ปรับ state ระหว่าง render ตามรูปแบบที่ React แนะนำ ไม่ใช่ใน useEffect —
    แบบเดียวกับที่ event-filters.tsx และ thailand-map.tsx ทำ (ดูเหตุผลเต็มในสองไฟล์นั้น)
  */
  if (handledResult !== state) {
    setHandledResult(state);

    if (mode === "create" && state.status === "success") {
      setFields((current) => ({
        ...EMPTY_ADMIN_EVENT_FORM,
        category: current.category,
        province: current.province,
        district: current.district,
        startDate: current.startDate,
        endDate: current.endDate,
        isAllDay: current.isAllDay,
        startTime: current.startTime,
        endTime: current.endTime,
        isFree: current.isFree,
        status: current.status,
      }));
    }
  }

  /** โฟกัสช่องชื่องานหลังล้างฟอร์ม — เป็นการแตะ DOM จึงต้องอยู่ใน effect */
  useEffect(() => {
    if (mode === "create" && state.status === "success") titleRef.current?.focus();
  }, [state, mode]);

  /** ผูกช่องข้อความ/dropdown เข้ากับ state — กันไม่ให้ต้องเขียน handler ซ้ำทุกช่อง */
  function bind(name: keyof AdminEventFormValues) {
    return {
      name,
      value: String(fields[name]),
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
      ) => setFields((current) => ({ ...current, [name]: event.target.value })),
    };
  }

  function toggle(name: "isAllDay" | "isFree") {
    return {
      name,
      checked: fields[name],
      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
        setFields((current) => ({ ...current, [name]: event.target.checked })),
    };
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-5">
      {/* id เดินทางไปกับฟอร์มเพื่อให้ action รู้ว่าแก้ไขงานไหน — งานใหม่ส่งค่าว่าง */}
      <input type="hidden" name="id" value={fields.id} readOnly />

      {state.status === "error" && state.message ? (
        <p
          ref={messageRef}
          role="alert"
          tabIndex={-1}
          className="rounded-xl border border-red-900 bg-red-950/50 p-4 text-sm text-red-100 outline-none"
        >
          {state.message}
        </p>
      ) : null}

      {state.status === "success" && state.message ? (
        <p
          role="status"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-emerald-900 bg-emerald-950/40 p-4 text-sm text-emerald-100"
        >
          {state.message}
          {state.savedSlug ? (
            <Link
              href={`/events/${state.savedSlug}`}
              target="_blank"
              className="font-medium text-emerald-300 underline-offset-4 hover:underline"
            >
              ดูหน้างาน ↗
            </Link>
          ) : null}
        </p>
      ) : null}

      <Section title="เนื้อหางาน">
        <label className={labelClass}>
          <span className="font-medium">ชื่องาน *</span>
          <input {...bind("title")} ref={titleRef} required maxLength={200} className={fieldClass} />
          <FieldError message={errors.title} />
        </label>

        <label className={labelClass}>
          <span className="font-medium">รายละเอียดงาน *</span>
          <textarea
            {...bind("description")}
            required
            rows={4}
            placeholder="มีอะไรในงานบ้าง เหมาะกับใคร ต้องเตรียมอะไรไปไหม"
            className={fieldClass}
          />
          <FieldError message={errors.description} />
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            <span className="font-medium">หมวดหมู่ *</span>
            <select {...bind("category")} required className={fieldClass}>
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

          <label className={labelClass}>
            <span className="font-medium">รูปปกงาน</span>
            <input
              type="file"
              name="coverImage"
              accept="image/jpeg,image/png,image/webp"
              className="mt-1 block w-full text-sm text-muted file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-surface-muted file:px-4 file:font-medium file:text-foreground hover:file:bg-surface"
            />
            <span className="mt-1 block text-xs text-muted">
              {mode === "edit"
                ? "เลือกไฟล์ใหม่เพื่อแทนที่รูปเดิม ไม่เลือก = คงรูปเดิมไว้"
                : "ไม่ใส่ก็ได้ — ระบบสร้างภาพประกอบให้อัตโนมัติ"}
            </span>
            <FieldError message={errors.coverImage} />
          </label>
        </div>
      </Section>

      <Section title="สถานที่">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            <span className="font-medium">จังหวัด *</span>
            <select {...bind("province")} required className={fieldClass}>
              <option value="" disabled>
                เลือกจังหวัด
              </option>
              {ACTIVE_PROVINCES.map((province) => (
                <option key={province.slug} value={province.slug}>
                  {province.nameTh}
                </option>
              ))}
            </select>
            <FieldError message={errors.province} />
          </label>

          <label className={labelClass}>
            <span className="font-medium">อำเภอ / เขต</span>
            <input {...bind("district")} placeholder="เช่น เมืองชลบุรี" className={fieldClass} />
            <FieldError message={errors.district} />
          </label>
        </div>

        <label className={labelClass}>
          <span className="font-medium">ชื่อสถานที่ *</span>
          <input
            {...bind("venueName")}
            required
            placeholder="เช่น ลานหน้าศาลากลางจังหวัด"
            className={fieldClass}
          />
          <FieldError message={errors.venueName} />
        </label>

        <label className={labelClass}>
          <span className="font-medium">ที่อยู่</span>
          <input
            {...bind("address")}
            placeholder="ระดับตำบล/อำเภอ ไม่ต้องใส่ชื่อจังหวัดซ้ำ"
            className={fieldClass}
          />
          <FieldError message={errors.address} />
        </label>

        <label className={labelClass}>
          <span className="font-medium">ลิงก์ Google Maps</span>
          <input
            {...bind("mapLink")}
            type="url"
            placeholder="https://maps.app.goo.gl/..."
            className={fieldClass}
          />
          <span className="mt-1 block text-xs text-muted">
            {mode === "edit"
              ? "ใส่ลิงก์ใหม่เฉพาะเมื่อต้องการย้ายหมุด — เว้นว่างไว้จะคงพิกัดเดิม"
              : "ใส่แล้วงานจะขึ้นเป็นหมุดบนแผนที่ ระบบจะค้านถ้าพิกัดไม่ตรงกับจังหวัดที่เลือก"}
          </span>
          <FieldError message={errors.mapLink} />
        </label>
      </Section>

      <Section title="วันและเวลา">
        <div className="block text-sm">
          <span className="font-medium">วันที่จัดงาน *</span>

          {/* hidden input ทำให้ FormData อ่านค่าจากปฏิทินได้เหมือนช่องวันที่ปกติ */}
          <input type="hidden" name="startDate" value={fields.startDate} readOnly />
          <input type="hidden" name="endDate" value={fields.endDate} readOnly />

          <DateRangePicker
            from={fields.startDate || undefined}
            to={fields.endDate || undefined}
            onChange={(from, to) =>
              setFields((current) => ({ ...current, startDate: from ?? "", endDate: to ?? "" }))
            }
            placeholder="เลือกวันที่จัดงาน"
            invalid={Boolean(errors.startDate || errors.endDate)}
          />
          <span className="mt-1 block text-xs text-muted">
            งานวันเดียวให้กดวันเดิมซ้ำอีกครั้ง · แอดมินเลือกวันย้อนหลังได้
          </span>
          <FieldError message={errors.startDate ?? errors.endDate} />
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...toggle("isAllDay")} className="size-4 accent-brand-500" />
          <span>ไม่ระบุเวลา (งานทั้งวัน)</span>
        </label>

        {/*
          ซ่อนช่องเวลาเมื่อเป็นงานทั้งวัน แทนการปิดใช้งาน — ช่องที่กรอกไม่ได้แต่ยังเห็นอยู่
          ทำให้คนกรอกลังเลว่าต้องกรอกไหม ส่วนค่าที่พิมพ์ไว้ยังอยู่ใน state ถ้าติ๊กกลับ
        */}
        {!fields.isAllDay ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span className="font-medium">เวลาเริ่ม *</span>
              <input {...bind("startTime")} type="time" className={fieldClass} />
              <FieldError message={errors.startTime} />
            </label>

            <label className={labelClass}>
              <span className="font-medium">เวลาสิ้นสุด *</span>
              <input {...bind("endTime")} type="time" className={fieldClass} />
              <FieldError message={errors.endTime} />
            </label>
          </div>
        ) : null}
      </Section>

      <Section title="ค่าเข้าชม">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" {...toggle("isFree")} className="size-4 accent-brand-500" />
          <span>เข้าฟรี</span>
        </label>

        {!fields.isFree ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span className="font-medium">ราคาต่ำสุด (บาท)</span>
              <input {...bind("priceMin")} type="number" min={0} className={fieldClass} />
              <FieldError message={errors.priceMin} />
            </label>

            <label className={labelClass}>
              <span className="font-medium">ราคาสูงสุด (บาท)</span>
              <input {...bind("priceMax")} type="number" min={0} className={fieldClass} />
              <FieldError message={errors.priceMax} />
            </label>
          </div>
        ) : null}

        <label className={labelClass}>
          <span className="font-medium">ลิงก์ซื้อบัตร</span>
          <input {...bind("ticketUrl")} type="url" className={fieldClass} />
          <FieldError message={errors.ticketUrl} />
        </label>
      </Section>

      <Section title="ที่มาและสถานะ">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className={labelClass}>
            <span className="font-medium">ชื่อผู้จัดงาน</span>
            <input
              {...bind("organizerName")}
              placeholder="แสดงบนหน้างาน"
              className={fieldClass}
            />
            <FieldError message={errors.organizerName} />
          </label>

          <label className={labelClass}>
            <span className="font-medium">ช่องทางติดต่อผู้จัด</span>
            <input
              {...bind("contact")}
              placeholder="ไม่แสดงบนหน้าเว็บ"
              className={fieldClass}
            />
            <FieldError message={errors.contact} />
          </label>
        </div>

        <label className={labelClass}>
          <span className="font-medium">ลิงก์ประกาศงาน</span>
          <input
            {...bind("sourceUrl")}
            type="url"
            placeholder="https://facebook.com/..."
            className={fieldClass}
          />
          <FieldError message={errors.sourceUrl} />
        </label>

        <label className={labelClass}>
          <span className="font-medium">สถานะ *</span>
          <select {...bind("status")} required className={fieldClass}>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-muted">
            มีเฉพาะงานสถานะ &quot;เผยแพร่&quot; ที่ขึ้นหน้าเว็บสาธารณะ
          </span>
          <FieldError message={errors.status} />
        </label>
      </Section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="glow-brand min-h-12 rounded-xl bg-brand-600 px-6 font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-60"
        >
          {pending ? "กำลังบันทึก…" : mode === "create" ? "บันทึกงาน" : "บันทึกการแก้ไข"}
        </button>

        <Link
          href="/admin"
          className="flex min-h-12 items-center text-sm text-muted underline-offset-4 hover:underline"
        >
          กลับไปหน้ารายการ
        </Link>
      </div>
    </form>
  );
}
