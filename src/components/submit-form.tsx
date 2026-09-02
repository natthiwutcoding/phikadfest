"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";

import { submitEvent } from "@/app/(site)/submit/actions";
import { DateRangePicker } from "@/components/date-range-picker";
import { SubmitSuccessDialog } from "@/components/submit-success-dialog";
import { INITIAL_SUBMIT_STATE } from "@/lib/form-state";
import { CATEGORIES } from "@/lib/data/categories";
import { ACTIVE_PROVINCES, ACTIVE_REGION_LABEL } from "@/lib/region-scope";
import type { SubmitField } from "@/lib/submit-validation";

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

/**
 * ลำดับช่องตามที่วางบนหน้าจอ — ใช้หาว่าควรพาผู้ใช้ไปแก้จุดไหนก่อน
 *
 * ⚠️ ห้ามใช้ลำดับคีย์ใน object errors แทน
 * actions.ts ตรวจ coverImage ก่อน title ถ้าเรียงตามนั้น ผู้ใช้ที่ผิดทั้งชื่องานและไฟล์รูป
 * จะถูกพาไปช่องรูปซึ่งอยู่เกือบล่างสุด แล้วต้องเลื่อนขึ้นไปหาช่องชื่องานเองอยู่ดี
 */
const FIELD_ORDER: readonly SubmitField[] = [
  "title",
  "description",
  "category",
  "province",
  "venueName",
  "mapLink",
  "startDate",
  "endDate",
  "coverImage",
  "contact",
  "sourceUrl",
] as const;

/** ช่องวันที่เก็บค่าใน hidden input ซึ่งโฟกัสไม่ได้ ต้องเล็งไปที่ปุ่มเปิดปฏิทินแทน */
const DATE_FIELDS = new Set(["startDate", "endDate"]);

/** ช่องข้อความและ dropdown ทั้งหมด — วันที่กับรูปแยกจัดการต่างหาก */
const EMPTY_FIELDS = {
  title: "",
  description: "",
  category: "",
  province: "",
  venueName: "",
  mapLink: "",
  contact: "",
  sourceUrl: "",
};

export function SubmitForm() {
  const [state, formAction, pending] = useActionState(submitEvent, INITIAL_SUBMIT_STATE);
  const errors = state.errors ?? {};

  /**
   * ค่าที่ผู้ใช้กรอก — เก็บใน state ไม่ปล่อยไว้ใน DOM
   *
   * ⚠️ จำเป็น ไม่ใช่แค่ความชอบส่วนตัว: React สั่ง reset ฟอร์มหลัง form action ทำงานเสร็จ
   * ไม่ว่าผลจะสำเร็จหรือไม่ ถ้าเป็น uncontrolled ผู้ใช้ที่กรอกครบแล้วพลาดจุดเดียว
   * จะเสียข้อมูลทั้งฟอร์มและต้องกรอกใหม่หมด (ทดสอบแล้วว่าหายจริงทุกช่อง)
   * ค่าที่มาจาก state ไม่ถูก reset ไม่ว่ากรณีใด
   */
  const [fields, setFields] = useState(EMPTY_FIELDS);

  /** วันที่จัดงานที่เลือกจากปฏิทิน — เก็บใน state เพราะ popup ไม่ได้เขียนค่าลง DOM เอง */
  const [eventDates, setEventDates] = useState<{ from?: string; to?: string }>({});

  /** ผู้ใช้ปิดกล่องแจ้งผลสำเร็จไปแล้วหรือยัง — กันไม่ให้เด้งซ้ำทุก render */
  const [successDismissed, setSuccessDismissed] = useState(false);

  const formRef = useRef<HTMLFormElement>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);

  /**
   * พาผู้ใช้ไปยังจุดที่กรอกผิดทันทีที่เซิร์ฟเวอร์ตีกลับ
   *
   * ฟอร์มยาวเกินหนึ่งหน้าจอ ผู้ใช้กดปุ่มส่งตอนอยู่ล่างสุด ถ้าที่ผิดคือช่องชื่องานซึ่งอยู่บนสุด
   * ข้อความแจ้งจะอยู่นอกสายตา — เห็นแค่ว่ากดแล้วไม่มีอะไรเกิดขึ้น
   *
   * ผูกกับ state ซึ่งเป็น object ใหม่ทุกครั้งที่ action คืนค่า จึงทำงานครั้งเดียวต่อการกดส่ง
   * หนึ่งครั้ง ไม่กระโดดซ้ำระหว่างที่ผู้ใช้พิมพ์แก้
   */
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
      : // ไม่มี error รายช่อง (เช่น "บันทึกไม่สำเร็จ") — พาไปที่กล่องข้อความรวมด้านบนแทน
        messageRef.current;

    if (!(target instanceof HTMLElement)) return;

    /*
      โฟกัสก่อนแล้วค่อยเลื่อนเอง — preventScroll กันไม่ให้เบราว์เซอร์กระโดดไปเองแบบไม่มี
      อนิเมชั่น ซึ่งจะชนกับการเลื่อนแบบ smooth ด้านล่าง
      การย้ายโฟกัสไปที่ช่องแรกที่ผิดเป็นแนวทางที่ WCAG แนะนำ ผู้ใช้จึงพิมพ์แก้ได้ทันที
    */
    target.focus({ preventScroll: true });

    // ผู้ใช้ที่ตั้งค่าลดการเคลื่อนไหวไว้ (มักเพราะเวียนหัว) ให้กระโดดทันทีแทนการไถล
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
  }, [state]);

  /*
    เริ่มส่งรอบใหม่ = ต้องพร้อมเด้งกล่องอีกครั้ง ไม่งั้นส่งสำเร็จครั้งที่สองจะเงียบ
    ปรับ state ระหว่าง render ตามรูปแบบที่ React แนะนำ (ใช้แบบเดียวกับ event-filters.tsx)
  */
  if (pending && successDismissed) setSuccessDismissed(false);

  /** ตัวช่วยผูกช่องกรอกเข้ากับ state — กันไม่ให้ต้องเขียน handler ซ้ำทุกช่อง */
  function bind(name: keyof typeof EMPTY_FIELDS) {
    return {
      name,
      value: fields[name],
      onChange: (
        event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
      ) => setFields((current) => ({ ...current, [name]: event.target.value })),
    };
  }

  /** ล้างฟอร์มทั้งใบหลังส่งสำเร็จ กันการกดส่งซ้ำจนได้งานซ้ำในคิวตรวจ */
  function resetForm() {
    setFields(EMPTY_FIELDS);
    setEventDates({});
    setSuccessDismissed(true);
  }

  /**
   * ส่งฟอร์มเอง แทนการใช้ <form action={formAction}>
   *
   * ⚠️ ห้ามเปลี่ยนกลับไปใช้ action prop
   * React จะสั่ง reset ฟอร์มให้อัตโนมัติหลัง action ทำงานเสร็จ ซึ่งล้าง DOM ของ <select>
   * โดยที่ค่าใน state ยังอยู่ครบ — React ไม่ sync <select> กลับจาก value prop ให้
   * (ต่างจาก <input> ที่ sync ให้) ผลคือหมวดหมู่กับจังหวัดหายทุกครั้งที่ส่งไม่ผ่าน
   * ทั้งที่ช่องอื่นอยู่ครบ ทดสอบยืนยันมาแล้ว
   *
   * เรียกเองแบบนี้ไม่มี auto-reset ค่าทุกช่องจึงอยู่ครบให้ผู้ใช้แก้เฉพาะจุดที่ผิด
   * (การตรวจ required ของเบราว์เซอร์ยังทำงานก่อนถึงตรงนี้ตามปกติ)
   */
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(() => formAction(formData));
  }

  return (
    <>
      {/*
        ⚠️ กล่องแจ้งผลต้องอยู่นอก <form> เด็ดขาด
        ข้างในมี <form method="dialog"> ของตัวเอง และ HTML ไม่อนุญาตให้ form ซ้อน form
        ถ้าวางไว้ข้างใน เบราว์เซอร์จะทิ้ง form ชั้นในไป ปุ่มในกล่องจึงไปกดส่งฟอร์มใหญ่แทน
        และการล้างฟอร์มก็ไม่ทำงาน (เคยพลาดมาแล้ว)
      */}
      {state.status === "success" && state.message && !successDismissed ? (
        <SubmitSuccessDialog message={state.message} onClose={resetForm} />
      ) : null}

      <form ref={formRef} onSubmit={handleSubmit} className="mt-6 space-y-5">
        {state.status === "error" && state.message ? (
          <p
            ref={messageRef}
            role="alert"
            // tabIndex -1 ทำให้โฟกัสด้วยโค้ดได้ แต่ไม่เข้าไปอยู่ในลำดับการกด Tab ปกติ
            tabIndex={-1}
            className="rounded-xl border border-red-900 bg-red-950/50 p-4 text-sm text-red-100 outline-none"
          >
            {state.message}
          </p>
        ) : null}

        <label className="block">
          <span className="font-medium">ชื่องาน *</span>
          <input {...bind("title")} required maxLength={200} className={fieldClass} />
          <FieldError message={errors.title} />
        </label>

        <label className="block">
          <span className="font-medium">รายละเอียดงาน *</span>
          <textarea
            {...bind("description")}
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

          <label className="block">
            <span className="font-medium">จังหวัด *</span>
            {/*
              เหลือภาคเดียวจึงไม่ต้องมี <optgroup> แล้ว — การจัดกลุ่มที่มีกลุ่มเดียว
              เพิ่มความรกโดยไม่ช่วยให้หาง่ายขึ้น
            */}
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
            <span className="mt-1 block text-sm text-muted">
              ตอนนี้เปิดรับเฉพาะงานใน{ACTIVE_REGION_LABEL}
            </span>
            <FieldError message={errors.province} />
          </label>
        </div>

        <label className="block">
          <span className="font-medium">สถานที่จัดงาน *</span>
          <input
            {...bind("venueName")}
            required
            placeholder="เช่น ลานหน้าศาลากลางจังหวัด"
            className={fieldClass}
          />
          <FieldError message={errors.venueName} />
        </label>

        <label className="block">
          <span className="font-medium">ลิงก์ Google Maps ของสถานที่</span>
          <input
            {...bind("mapLink")}
            type="url"
            placeholder="https://maps.app.goo.gl/..."
            className={fieldClass}
          />
          <span className="mt-1 block text-sm text-muted">
            ใส่แล้วงานจะขึ้นเป็นหมุดบนแผนที่ ทำให้คนหาเจอง่ายขึ้นมาก — เปิด Google Maps
            หาสถานที่ กดปุ่ม &quot;แชร์&quot; แล้วก๊อปลิงก์มาวาง
          </span>
          <FieldError message={errors.mapLink} />
        </label>

        <div className="block">
          <span className="font-medium">วันที่จัดงาน *</span>

          {/*
            hidden input ทำให้ Server Action อ่านค่าได้เหมือนตอนเป็น <input type="date">
            จึงไม่ต้องแก้ submit/actions.ts เลย

            หมายเหตุ: browser ไม่ตรวจ required ให้กับ input ที่ซ่อนอยู่ การกดส่งโดยไม่เลือกวัน
            จึงต้องพึ่ง validation ฝั่งเซิร์ฟเวอร์ ซึ่งมีอยู่แล้วและส่ง error กลับมาแสดงได้
          */}
          <input type="hidden" name="startDate" value={eventDates.from ?? ""} readOnly />
          <input type="hidden" name="endDate" value={eventDates.to ?? ""} readOnly />

          <DateRangePicker
            from={eventDates.from}
            to={eventDates.to}
            onChange={(from, to) => setEventDates({ from, to })}
            placeholder="เลือกวันที่จัดงาน"
            disablePast
            invalid={Boolean(errors.startDate || errors.endDate)}
          />

          <span className="mt-1 block text-sm text-muted">
            งานวันเดียวให้กดวันเดิมซ้ำอีกครั้ง
          </span>
          {/* เหลือช่องเดียวแล้ว จึงรวม error ของทั้งวันเริ่มและวันจบมาแสดงที่เดียว */}
          <FieldError message={errors.startDate ?? errors.endDate} />
        </div>

        <label className="block">
          <span className="font-medium">รูปปกงาน</span>
          {/*
            accept กรองในหน้าต่างเลือกไฟล์เพื่อความสะดวก แต่ตัวที่บังคับจริงคือ
            การตรวจฝั่งเซิร์ฟเวอร์ และ allowed_mime_types ที่ระดับ Storage bucket
          */}
          <input
            type="file"
            name="coverImage"
            accept="image/jpeg,image/png,image/webp"
            className="mt-1 block w-full text-sm text-muted file:mr-3 file:min-h-11 file:rounded-lg file:border-0 file:bg-surface-muted file:px-4 file:font-medium file:text-foreground hover:file:bg-surface"
          />
          <span className="mt-1 block text-sm text-muted">
            ไม่ใส่ก็ได้ — ถ้าไม่มีรูป ระบบจะสร้างภาพประกอบให้อัตโนมัติ · รองรับ JPG PNG WebP
            ขนาดไม่เกิน 5MB
          </span>
          {/*
            ต้องบอกไว้ตรงนี้ เพราะช่องไฟล์เป็นช่องเดียวที่เก็บค่าไว้ให้ไม่ได้
            เบราว์เซอร์ห้ามเว็บกำหนดค่าให้ <input type="file"> เอง (เหตุผลด้านความปลอดภัย)
            ค่าจึงหายทุกครั้งที่ส่งไม่ผ่าน ต่างจากช่องอื่นที่เก็บไว้ใน state ได้
          */}
          {state.status === "error" ? (
            <span className="mt-1 block text-sm text-muted">
              หากเคยเลือกรูปไว้ กรุณาเลือกใหม่อีกครั้ง
            </span>
          ) : null}
          <FieldError message={errors.coverImage} />
        </label>

        <label className="block">
          <span className="font-medium">ช่องทางติดต่อผู้จัด *</span>
          <input
            {...bind("contact")}
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
            {...bind("sourceUrl")}
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
    </>
  );
}
