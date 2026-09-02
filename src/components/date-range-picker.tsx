"use client";

import { useEffect, useId, useRef, useState } from "react";

import { bangkokDay, formatDayRange, formatMonthYear } from "@/lib/format";

/**
 * ปฏิทินเลือกช่วงวันที่ แบบเด้ง popup
 *
 * ── ทำไมไม่ใช้ <input type="date"> ──
 * รูปแบบวันและปฏิทินของ input มาตรฐานขึ้นกับ "ภาษาของเบราว์เซอร์" ไม่ใช่ของเว็บ
 * เครื่องที่ตั้งเป็น en-US จะเห็น mm/dd/yyyy กับปฏิทิน ค.ศ. ขณะที่การ์ดงานทั้งเว็บ
 * แสดงเป็น พ.ศ. ผู้ใช้จึงต้องแปลงปีในหัวเอง และเราควบคุมอะไรไม่ได้เลย
 * อีกทั้งสองช่องแยกกันยังเลือกช่วงกลับหัวได้ (วันจบมาก่อนวันเริ่ม) ซึ่งค้นแล้วไม่เจออะไร
 *
 * ── กติกาเรื่องวันที่ ──
 * ทำงานกับสตริง 'YYYY-MM-DD' ล้วน และคำนวณปฏิทินด้วย Date.UTC เท่านั้น
 * ห้ามสร้าง Date แบบเวลาท้องถิ่น ไม่งั้นวันจะเพี้ยนไปหนึ่งวันในบางเขตเวลา
 * (กฎเดียวกับที่ lib/format.ts ยึดไว้ ดูเหตุผลเต็มในหัวไฟล์นั้น)
 */

interface Props {
  /** 'YYYY-MM-DD' — ค่าจริงที่ใช้อยู่ อ่านมาจาก URL หรือจาก state ของฟอร์ม */
  from?: string;
  to?: string;
  onChange: (from?: string, to?: string) => void;
  /** ข้อความบนปุ่มตอนยังไม่ได้เลือก */
  placeholder?: string;
  /**
   * ปิดไม่ให้เลือกวันที่ผ่านมาแล้ว — ใช้กับฟอร์มแจ้งงานที่รับเฉพาะงานในอนาคต
   *
   * "วันนี้" คำนวณในนี้ตอน render ปฏิทิน ไม่รับเป็น prop จากภายนอก เพราะ component แม่
   * จะคำนวณตอน render แรกซึ่งเซิร์ฟเวอร์กับเบราว์เซอร์อาจได้คนละวันถ้าเปิดหน้าคาบเที่ยงคืน
   * ปฏิทินถูก render หลังเปิด popup เท่านั้น จึงพ้นช่วง hydration ไปแล้วเสมอ
   */
  disablePast?: boolean;
  /** มีข้อผิดพลาดที่ช่องนี้ — ทำให้ขอบเป็นสีแดงให้เข้าชุดกับ FieldError ของฟอร์ม */
  invalid?: boolean;
}

/** ชื่อวันหัวตาราง เริ่มวันอาทิตย์ตามปฏิทินไทย */
const WEEKDAY_LABELS = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

/** แปลงเลขปี/เดือน/วัน เป็นสตริง 'YYYY-MM-DD' */
function toDayString(year: number, monthIndex: number, day: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** จำนวนวันในเดือน — วันที่ 0 ของเดือนถัดไปคือวันสุดท้ายของเดือนนี้ */
function daysInMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** วันในสัปดาห์ของวันที่ 1 (0 = อาทิตย์) ใช้เว้นช่องว่างต้นเดือน */
function firstWeekday(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
}

export function DateRangePicker({
  from,
  to,
  onChange,
  placeholder = "เลือกช่วงวันที่",
  disablePast = false,
  invalid = false,
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogId = useId();

  /**
   * วันเริ่มที่เลือกไว้ระหว่างรอคลิกวันจบ
   *
   * เก็บแยกจาก props เพราะระหว่างนี้ยังไม่ควรยิงค้นหา — ช่วงยังไม่สมบูรณ์
   * พอได้ครบคู่จึงเรียก onChange ทีเดียว
   */
  const [draftStart, setDraftStart] = useState<string | null>(null);

  /** เดือนที่ปฏิทินกำลังแสดง — เปิดมาที่เดือนของวันเริ่มที่เลือกไว้ ไม่งั้นเดือนปัจจุบัน */
  const [viewMonth, setViewMonth] = useState(() => {
    const base = from ?? bangkokDay(new Date());
    return { year: Number(base.slice(0, 4)), month: Number(base.slice(5, 7)) - 1 };
  });

  // ปิดเมื่อคลิกนอก popup — ผูก listener เฉพาะตอนเปิด จะได้ไม่ทำงานทิ้งไว้เปล่าๆ
  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function openPicker() {
    // เปิดมาที่เดือนของช่วงที่เลือกไว้เสมอ ผู้ใช้จะได้เห็นบริบทของสิ่งที่เลือกอยู่
    const base = from ?? bangkokDay(new Date());
    setViewMonth({ year: Number(base.slice(0, 4)), month: Number(base.slice(5, 7)) - 1 });
    setDraftStart(null);
    setOpen(true);
  }

  function closeAndReturnFocus() {
    setOpen(false);
    setDraftStart(null);
    triggerRef.current?.focus();
  }

  /**
   * คลิกวันในปฏิทิน
   *
   * คลิกแรกตั้งวันเริ่ม คลิกที่สองปิดช่วง — ถ้าคลิกที่สองอยู่ก่อนวันเริ่ม
   * ให้ถือว่าเริ่มเลือกใหม่จากวันนั้น แทนที่จะขึ้น error ให้ผู้ใช้อ่าน
   * วิธีนี้ทำให้ช่วงกลับหัวเกิดขึ้นไม่ได้เลยตั้งแต่ต้นทาง
   */
  function pickDay(day: string) {
    if (!draftStart || day < draftStart) {
      setDraftStart(day);
      return;
    }

    onChange(draftStart, day);
    setDraftStart(null);
    setOpen(false);
  }

  function shiftMonth(delta: number) {
    setViewMonth((current) => {
      const next = new Date(Date.UTC(current.year, current.month + delta, 1));
      return { year: next.getUTCFullYear(), month: next.getUTCMonth() };
    });
  }

  const label = formatDayRange(from, to);
  const today = bangkokDay(new Date());

  return (
    <div
      ref={containerRef}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          closeAndReturnFocus();
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        /*
          ไม่ใส่ aria-invalid เพราะ role button ไม่รองรับ — ผู้ช่วยอ่านหน้าจอรับรู้ข้อผิดพลาด
          จาก <p role="alert"> ของ FieldError ที่อยู่ใต้ปุ่มอยู่แล้ว ตรงนี้จึงบอกด้วยสีขอบพอ
        */
        className={`mt-1 flex min-h-11 w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition-colors ${
          invalid ? "border-red-500" : open ? "border-brand-500" : "border-line"
        } bg-background hover:border-brand-400`}
      >
        <span aria-hidden className="text-muted">
          📅
        </span>
        <span className={label ? "" : "text-muted"}>{label ?? placeholder}</span>
      </button>

      {open ? (
        <div
          id={dialogId}
          role="dialog"
          aria-label="เลือกช่วงวันที่"
          /*
            sm:left-auto sm:right-0 — บนจอเล็กปฏิทินชิดซ้ายของช่อง แต่บนจอใหญ่ชิดขวา
            เพราะช่องนี้อยู่คอลัมน์ขวาสุดของแถวตัวกรอง ถ้าปล่อยชิดซ้ายจะล้นออกนอกการ์ด
          */
          className="absolute top-full left-0 z-30 mt-1 w-72 rounded-2xl border border-line bg-surface/95 p-3 shadow-lg backdrop-blur sm:right-0 sm:left-auto"
        >
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="เดือนก่อนหน้า"
              className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              ‹
            </button>

            <p aria-live="polite" className="text-sm font-semibold">
              {formatMonthYear(viewMonth.year, viewMonth.month)}
            </p>

            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="เดือนถัดไป"
              className="flex size-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
            >
              ›
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 gap-0.5 text-center text-xs text-muted">
            {WEEKDAY_LABELS.map((weekday) => (
              <span key={weekday} className="py-1">
                {weekday}
              </span>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {/* ช่องว่างก่อนวันที่ 1 เพื่อให้วันตรงคอลัมน์ของวันในสัปดาห์ */}
            {Array.from({ length: firstWeekday(viewMonth.year, viewMonth.month) }, (_, index) => (
              <span key={`pad-${index}`} />
            ))}

            {Array.from({ length: daysInMonth(viewMonth.year, viewMonth.month) }, (_, index) => {
              const day = toDayString(viewMonth.year, viewMonth.month, index + 1);

              // ระหว่างเลือกให้ไฮไลต์เฉพาะวันเริ่ม ยังไม่รู้ปลายช่วง
              const inRange = draftStart
                ? day === draftStart
                : Boolean(from && to && day >= from && day <= to);
              const isEdge = day === draftStart || day === from || day === to;
              const disabled = disablePast && day < today;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => pickDay(day)}
                  disabled={disabled}
                  aria-pressed={inRange}
                  aria-current={day === today ? "date" : undefined}
                  className={`flex h-10 items-center justify-center rounded-lg text-sm transition-colors ${
                    disabled
                      ? "cursor-not-allowed text-muted/40"
                      : isEdge
                        ? "bg-brand-600 font-semibold text-white"
                        : inRange
                          ? "bg-brand-900/60 text-brand-100"
                          : "hover:bg-surface-muted"
                  } ${day === today && !isEdge && !disabled ? "ring-1 ring-brand-500/60" : ""}`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
            {/*
              ต้องบอกวิธีเลือกงานวันเดียวตรงนี้ เพราะการกดวันเดิมซ้ำใช้ได้อยู่แล้ว
              แต่ไม่มีอะไรบนหน้าจอบอกใบ้ให้ผู้ใช้รู้เลย — งานวันเดียวเป็นกรณีที่พบบ่อยที่สุด
              ในฟอร์มแจ้งงาน (คาร์มีท คอนเสิร์ต เวิร์กช็อป)
            */}
            <p className="text-xs text-muted">
              {draftStart ? "เลือกวันสิ้นสุด · กดวันเดิมซ้ำถ้าจัดวันเดียว" : "เลือกวันเริ่มต้น"}
            </p>

            {from || to ? (
              <button
                type="button"
                onClick={() => {
                  onChange(undefined, undefined);
                  setDraftStart(null);
                  setOpen(false);
                }}
                className="min-h-9 rounded-lg px-3 text-sm text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
              >
                ล้างวันที่
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
