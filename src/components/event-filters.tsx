"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { DateRangePicker } from "@/components/date-range-picker";
import { CATEGORIES } from "@/lib/data/categories";
import { ACTIVE_PROVINCES } from "@/lib/region-scope";

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

  /**
   * ข้อความค้นหาเก็บเป็น state ของ component ไม่ใช่ปล่อยให้อยู่ใน DOM ของฟอร์ม
   *
   * เพราะฟอร์มถูก remount เมื่อผู้ใช้เปลี่ยนจังหวัด/หมวดหมู่/ช่วงวันที่ (ดู key ด้านล่าง)
   * ถ้าข้อความอยู่ใน DOM จะหายไปพร้อมฟอร์ม แต่ถ้าอยู่ใน state จะรอดข้าม remount
   */
  const [query, setQuery] = useState(values.q ?? "");

  /** ค่า q ที่เราส่งเข้า router.push ครั้งล่าสุด — ใช้บอกว่า URL นี้เราเป็นคนสั่งเอง */
  const [lastSentQuery, setLastSentQuery] = useState(values.q ?? "");

  /** ค่า q จาก URL ที่ประมวลผลไปแล้ว — กันไม่ให้ปรับ state ซ้ำทุก render */
  const [syncedUrlQuery, setSyncedUrlQuery] = useState(values.q ?? "");

  /*
    ปรับ state ระหว่าง render เมื่อค่าจากภายนอกเปลี่ยน — รูปแบบที่ React แนะนำ
    (ใช้แบบเดียวกันใน map/thailand-map.tsx กับตัวแปร syncedCode)

    ⚠️ ต้องใช้ตัวแปรสองตัวแยกกัน ห้ามยุบเป็นตัวเดียว
    router.push อยู่ใน startTransition จึงไม่ได้เปลี่ยน URL ทันที ถ้าใช้ตัวแปรตัวเดียว
    ค่าที่เราจำไว้จะอัปเดตก่อน URL หลายเฟรม ทำให้โค้ดตรงนี้เข้าใจผิดว่า
    "URL ถูกเปลี่ยนจากภายนอกเป็นค่าว่าง" แล้วล้างสิ่งที่ผู้ใช้เพิ่งพิมพ์ทิ้ง

    เทียบกับค่าที่เราเพิ่งส่งไปเอง ไม่ใช่ sync ทุกครั้งที่ URL เปลี่ยน เพราะ debounce
    หน่วง 400ms แต่คนพิมพ์เร็วกว่านั้น URL จึงตามหลังสิ่งที่ผู้ใช้พิมพ์อยู่เสมอ
  */
  if ((values.q ?? "") !== syncedUrlQuery) {
    const next = values.q ?? "";
    setSyncedUrlQuery(next);
    // ตรงกับค่าที่เราส่งไป = ผลจากการพิมพ์ของผู้ใช้เอง ไม่ต้องแตะช่องค้นหา
    if (next !== lastSentQuery) setQuery(next);
  }

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  /**
   * @param overrides ค่าที่เพิ่งเลือกและยังไม่ทันสะท้อนลง DOM
   *
   * จำเป็นสำหรับปฏิทินช่วงวันที่ ซึ่งเก็บค่าไว้ใน hidden input ที่ผูกกับ state —
   * React ยังไม่ commit ตอนที่ navigate() ทำงาน ถ้าอ่านจาก FormData อย่างเดียว
   * จะได้ค่าเก่าไปหนึ่งจังหวะ (บั๊กจังหวะแบบเดียวกับที่เคยเจอในช่องค้นหาข้อความ)
   */
  function navigate(overrides?: Record<string, string | undefined>) {
    const form = formRef.current;
    if (!form) return;

    const params = new URLSearchParams();
    for (const [key, value] of new FormData(form).entries()) {
      if (typeof value === "string" && value.trim()) params.set(key, value.trim());
    }

    for (const [key, value] of Object.entries(overrides ?? {})) {
      if (value) params.set(key, value);
      else params.delete(key);
    }

    // จำค่าที่ส่งไป เพื่อให้ตอน URL เปลี่ยนกลับมา รู้ว่าเป็นผลจากการพิมพ์ของผู้ใช้เอง ไม่ใช่จากภายนอก
    setLastSentQuery(params.get("q") ?? "");

    const queryString = params.toString();
    // scroll: false — ผู้ใช้กำลังดูรายการอยู่ตรงนี้ ไม่ควรกระโดดขึ้นบนสุดทุกครั้งที่เปลี่ยนตัวกรอง
    startTransition(() => {
      router.push(queryString ? `/events?${queryString}` : "/events", { scroll: false });
    });
  }

  /** dropdown และช่องวันที่ — เปลี่ยนค่าปุ๊บกรองทันที ไม่ต้องรอกดปุ่ม */
  function handleFieldChange() {
    clearTimeout(debounceRef.current);
    navigate();
  }

  /** ช่องค้นหาข้อความ — หน่วงเวลาไว้กันยิง request รัวทุกตัวอักษรที่พิมพ์ */
  function handleTextChange(event: ChangeEvent<HTMLInputElement>) {
    // อัปเดตทันทีเพื่อให้ตัวอักษรขึ้นบนจอตามที่พิมพ์ ส่วนการค้นหาค่อยตามมาหลังหน่วงเวลา
    setQuery(event.target.value);
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
      /*
        key ทำให้ฟอร์ม remount เมื่อ values เปลี่ยนจากภายนอก (เช่น กดปุ่มย้อนกลับ หรือ "ล้างตัวกรอง")
        เพราะ defaultValue ของ <select> และ <input type="date"> อ่านแค่ตอน mount ครั้งแรก
        ไม่ sync กับ prop ที่เปลี่ยนทีหลัง

        ⚠️ ห้ามใส่ values.q กลับเข้ามาใน key เด็ดขาด
        การพิมพ์ของผู้ใช้เปลี่ยน URL เองทุก 400ms ถ้า q อยู่ใน key ฟอร์มจะถูกสร้างใหม่
        กลางคันทุกครั้ง โฟกัสหลุดและตัวอักษรที่พิมพ์ค้างไว้หายไป — ผลคือพิมพ์ได้แค่ตัวเดียว
        แล้วพิมพ์ต่อไม่ได้เลย (เคยเป็นบั๊กจริงมาแล้ว)
        ช่องค้นหาจึงเป็น controlled component ที่เก็บค่าไว้ใน state แทน
      */
      key={`${values.province ?? ""}|${values.category ?? ""}|${values.from ?? ""}|${values.to ?? ""}`}
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
            value={query}
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
            {/*
              เหลือภาคเดียวจึงไม่ต้องมี <optgroup> — การจัดกลุ่มที่มีกลุ่มเดียว
              เพิ่มความรกโดยไม่ช่วยให้หาง่ายขึ้น (แบบเดียวกับที่ทำใน submit-form.tsx)
            */}
            {ACTIVE_PROVINCES.map((province) => (
              <option key={province.slug} value={province.slug}>
                {province.nameTh}
              </option>
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

        <div className="block text-sm">
          <span className="font-medium">ช่วงวันที่</span>
          {/*
            hidden input ทำให้ FormData ยังอ่านค่าได้เหมือนตอนเป็น <input type="date">
            navigate() จึงไม่ต้องรู้จักปฏิทินเป็นกรณีพิเศษ นอกจากตอนที่ค่าเพิ่งเปลี่ยน
          */}
          <input type="hidden" name="from" value={values.from ?? ""} readOnly />
          <input type="hidden" name="to" value={values.to ?? ""} readOnly />

          <DateRangePicker
            from={values.from}
            to={values.to}
            onChange={(from, to) => navigate({ from, to })}
          />
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
