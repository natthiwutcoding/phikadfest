"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useTransition, type FormEvent } from "react";

import { CATEGORIES } from "@/lib/data/categories";
import { PROVINCES_BY_REGION } from "@/lib/data/provinces";

export interface FilterValues {
  province?: string;
  category?: string;
  from?: string;
  to?: string;
  q?: string;
}

const TEXT_DEBOUNCE_MS = 400;

/**
 * ฟอร์มกรองงาน — real-time แต่ยังคง SSR/SEO เดิมไว้ (soft navigation)
 *
 * ยังเป็น <form method="get" action="/events"> เหมือนเดิมเป็นฐาน (progressive enhancement):
 * ถ้า JavaScript โหลดไม่สำเร็จ ฟอร์มยัง submit แบบเบราว์เซอร์ปกติได้ ผลลัพธ์อยู่ใน URL เหมือนเดิม
 *
 * เมื่อ JS ทำงาน จะดักการ submit/เปลี่ยนค่า แล้วใช้ next/navigation router.push แทน
 * ซึ่งเป็น "soft navigation" ของ Next.js — อัปเดต URL และเนื้อหาโดยไม่มีจอขาว/reload เต็มหน้า
 * แต่หน้า /events (Server Component) ยังคง render จากเซิร์ฟเวอร์ตาม searchParams เหมือนเดิมทุกอย่าง
 * จึงไม่กระทบ SEO หรือ URL ที่แชร์ได้ที่ตั้งใจทำไว้ (ดู docs/02-tech-stack.md)
 */
export function EventFilters({ values }: { values: FilterValues }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  function navigate() {
    const form = formRef.current;
    if (!form) return;

    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    }

    const query = params.toString();
    // scroll: false — ผู้ใช้กำลังดูรายการอยู่ตรงนี้ ไม่ควรกระโดดขึ้นบนสุดทุกครั้งที่เปลี่ยนตัวกรอง
    startTransition(() => {
      router.push(query ? `/events?${query}` : "/events", { scroll: false });
    });
  }

  /** dropdown และช่องวันที่ — เปลี่ยนค่าปุ๊บกรองทันที ไม่ต้องรอกดปุ่ม */
  function handleFieldChange() {
    clearTimeout(debounceRef.current);
    navigate();
  }

  /** ช่องค้นหาข้อความ — หน่วงเวลาไว้กันยิง request รัวทุกตัวอักษรที่พิมพ์ */
  function handleTextChange() {
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(navigate, TEXT_DEBOUNCE_MS);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    clearTimeout(debounceRef.current);
    navigate();
  }

  const hasFilters = Boolean(values.province || values.category || values.from || values.to || values.q);

  return (
    <form
      // key ทำให้ฟอร์ม remount เมื่อ values เปลี่ยนจากภายนอก (เช่น กดปุ่มย้อนกลับ หรือ "ล้างตัวกรอง")
      // เพราะ defaultValue ของ input จะอ่านแค่ตอน mount ครั้งแรกเท่านั้น ไม่ sync กับ prop ที่เปลี่ยนทีหลัง
      key={`${values.q ?? ""}|${values.province ?? ""}|${values.category ?? ""}|${values.from ?? ""}|${values.to ?? ""}`}
      ref={formRef}
      method="get"
      action="/events"
      onSubmit={handleSubmit}
      className="rounded-2xl border border-line bg-surface p-4"
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="font-medium">ค้นหา</span>
          <input
            type="search"
            name="q"
            defaultValue={values.q ?? ""}
            onChange={handleTextChange}
            placeholder="ชื่องาน หรือสถานที่"
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-background px-3 py-2 outline-none focus:border-brand-500"
          />
        </label>

        <label className="block text-sm">
          <span className="font-medium">จังหวัด</span>
          <select
            name="province"
            defaultValue={values.province ?? ""}
            onChange={handleFieldChange}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-background px-3 py-2 outline-none focus:border-brand-500"
          >
            <option value="">ทุกจังหวัด</option>
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
        </label>

        <label className="block text-sm">
          <span className="font-medium">หมวดหมู่</span>
          <select
            name="category"
            defaultValue={values.category ?? ""}
            onChange={handleFieldChange}
            className="mt-1 min-h-11 w-full rounded-lg border border-line bg-background px-3 py-2 outline-none focus:border-brand-500"
          >
            <option value="">ทุกหมวดหมู่</option>
            {CATEGORIES.map((category) => (
              <option key={category.slug} value={category.slug}>
                {category.emoji} {category.nameTh}
              </option>
            ))}
          </select>
        </label>

        <div className="grid grid-cols-2 gap-2 text-sm">
          <label className="block">
            <span className="font-medium">ตั้งแต่</span>
            <input
              type="date"
              name="from"
              defaultValue={values.from ?? ""}
              onChange={handleFieldChange}
              className="mt-1 min-h-11 w-full rounded-lg border border-line bg-background px-2 py-2 outline-none focus:border-brand-500"
            />
          </label>
          <label className="block">
            <span className="font-medium">ถึง</span>
            <input
              type="date"
              name="to"
              defaultValue={values.to ?? ""}
              onChange={handleFieldChange}
              className="mt-1 min-h-11 w-full rounded-lg border border-line bg-background px-2 py-2 outline-none focus:border-brand-500"
            />
          </label>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <button
          type="submit"
          aria-busy={isPending}
          className="glow-brand min-h-11 rounded-xl bg-brand-600 px-5 text-sm font-medium text-white transition-colors hover:bg-brand-700 disabled:opacity-70"
        >
          {isPending ? "กำลังค้นหา…" : "ค้นหา"}
        </button>

        {hasFilters ? (
          <Link
            href="/events"
            className="flex min-h-11 items-center text-sm text-muted underline-offset-4 hover:underline"
          >
            ล้างตัวกรอง
          </Link>
        ) : null}
      </div>
    </form>
  );
}
