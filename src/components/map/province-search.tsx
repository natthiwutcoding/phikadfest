"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useRef, useState, useTransition } from "react";

import { ACTIVE_PROVINCES } from "@/lib/region-scope";
import type { Province } from "@/lib/types";

/** แสดงผลลัพธ์มากกว่านี้แล้วรายการจะยาวจนบังแผนที่ */
const MAX_RESULTS = 6;

interface Props {
  /** query string ปัจจุบัน (range) ที่ต้องพาไปด้วยตอนเลือกจังหวัด */
  baseParams: string;
}

/**
 * ช่องค้นหาจังหวัดบนแผนที่
 *
 * มีไว้เป็นทางลัดสำหรับคนที่รู้อยู่แล้วว่าจะไปจังหวัดไหน จะได้ไม่ต้องลากหาบนแผนที่
 * เลือกแล้วเปลี่ยน URL เหมือนกดจังหวัดบนแผนที่ทุกประการ กล้องจึงบินไปเองโดยใช้โค้ดชุดเดิม
 */
export function ProvinceSearch({ baseParams }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const listboxId = useId();

  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];

    // ค้นเฉพาะจังหวัดในภาคที่เปิดรับงาน ไม่งั้นค้นเจอจังหวัดที่กดไปแล้วไม่มีงานให้ดูเลย
    return ACTIVE_PROVINCES.filter(
      (province) =>
        province.nameTh.includes(needle) || province.nameEn.toLowerCase().includes(needle),
    ).slice(0, MAX_RESULTS);
  }, [query]);

  function select(province: Province) {
    const params = new URLSearchParams(baseParams);
    params.set("province", province.slug);

    setQuery("");
    setHighlighted(0);
    inputRef.current?.blur();

    startTransition(() => router.push(`/map?${params}`, { scroll: false }));
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setQuery("");
      inputRef.current?.blur();
      return;
    }

    if (results.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      select(results[highlighted] ?? results[0]);
    }
  }

  return (
    <div className="pointer-events-auto relative">
      <input
        ref={inputRef}
        type="search"
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setHighlighted(0);
        }}
        onKeyDown={handleKeyDown}
        placeholder="ค้นหาจังหวัด…"
        aria-label="ค้นหาจังหวัด"
        role="combobox"
        aria-expanded={results.length > 0}
        aria-controls={listboxId}
        aria-autocomplete="list"
        className="min-h-11 w-full rounded-2xl border border-line bg-surface/90 px-4 text-sm backdrop-blur outline-none focus:border-brand-500"
      />

      {results.length > 0 ? (
        <ul
          id={listboxId}
          role="listbox"
          className="absolute top-full right-0 left-0 mt-1 overflow-hidden rounded-2xl border border-line bg-surface/95 backdrop-blur"
        >
          {results.map((province, index) => (
            <li key={province.slug}>
              <button
                type="button"
                role="option"
                aria-selected={index === highlighted}
                // ใช้ onMouseDown เพราะ onClick จะยิงหลัง input เสีย focus
                // ซึ่งตอนนั้นรายการถูกซ่อนไปแล้ว ทำให้กดไม่ติด
                onMouseDown={(event) => {
                  event.preventDefault();
                  select(province);
                }}
                onMouseEnter={() => setHighlighted(index)}
                className={`flex min-h-11 w-full items-center justify-between gap-2 px-4 text-left text-sm transition-colors ${
                  index === highlighted ? "bg-brand-600 text-white" : "hover:bg-surface-muted"
                }`}
              >
                <span>{province.nameTh}</span>
                <span
                  className={index === highlighted ? "text-xs text-white/70" : "text-xs text-muted"}
                >
                  {province.nameEn}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
