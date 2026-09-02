import { describe, expect, it } from "vitest";

import { filterKey, normalizeFilters, parseFilterKey } from "@/lib/event-filter-key";
import type { EventFilters } from "@/lib/types";

/**
 * เทสต์ชุดนี้เกิดจากบั๊กจริงระหว่างการ refactor
 *
 * คีย์ถูกเขียนเป็น array แล้ว parse กลับมาเป็น array แต่โค้ดปลายทางอ่านเป็น object
 * ผลคือทุกช่องกลายเป็น undefined — ตัวกรองหายทั้งหมดโดยไม่มี error ให้เห็น
 * แผงจังหวัดบนแผนที่จึงขึ้น "47 งาน" (ทั้งภาค) แทนที่จะเป็นเฉพาะของจังหวัดนั้น
 *
 * บทเรียน: อะไรก็ตามที่เดินทางไปกลับผ่าน JSON ต้องมีเทสต์ยืนยันว่าไปกลับแล้วได้ค่าเดิม
 */

describe("filterKey ↔ parseFilterKey", () => {
  it("ไปกลับแล้วได้ตัวกรองครบทุกช่อง", () => {
    const filters: EventFilters = {
      provinceSlug: "chonburi",
      categorySlug: "music",
      from: "2026-09-01",
      to: "2026-09-30",
      query: "ดนตรี",
      upcomingOnly: false,
      limit: 10,
    };

    expect(parseFilterKey(filterKey(filters))).toEqual(filters);
  });

  it("ตัวกรองว่างไปกลับแล้วยังได้ค่าตั้งต้นครบ", () => {
    const parsed = parseFilterKey(filterKey({}));

    expect(parsed).toEqual({
      provinceSlug: "",
      categorySlug: "",
      from: "",
      to: "",
      query: "",
      upcomingOnly: true,
      limit: 0,
    });
  });

  it("ค่าที่ parse กลับมาต้องใช้กรองต่อได้จริง ไม่ใช่ได้ object ว่าง", () => {
    // บั๊กเดิมผ่านเทสต์ toEqual ไม่ได้ก็จริง แต่ข้อนี้ระบุอาการที่ผู้ใช้เห็นตรงๆ
    const parsed = parseFilterKey(filterKey({ provinceSlug: "chonburi" }));

    expect(parsed.provinceSlug).toBe("chonburi");
  });
});

describe("filterKey — การรวม query ที่เหมือนกัน", () => {
  it("ตัวกรองเดียวกันได้คีย์เดียวกัน แม้เขียนคนละลำดับ", () => {
    expect(filterKey({ from: "2026-09-01", to: "2026-09-30" })).toBe(
      filterKey({ to: "2026-09-30", from: "2026-09-01" }),
    );
  });

  it("ไม่ระบุ upcomingOnly เท่ากับระบุ true — หน้าแรกกับ sitemap จึงใช้ query ร่วมกันได้", () => {
    expect(filterKey({})).toBe(filterKey({ upcomingOnly: true }));
  });

  it("ช่องว่างหัวท้ายของคำค้นไม่ทำให้กลายเป็นคนละ query", () => {
    expect(filterKey({ query: "  ดนตรี  " })).toBe(filterKey({ query: "ดนตรี" }));
  });

  it("ตัวกรองต่างกันต้องได้คีย์ต่างกัน", () => {
    const base = filterKey({});

    expect(filterKey({ provinceSlug: "chonburi" })).not.toBe(base);
    expect(filterKey({ categorySlug: "music" })).not.toBe(base);
    expect(filterKey({ from: "2026-09-01" })).not.toBe(base);
    expect(filterKey({ to: "2026-09-30" })).not.toBe(base);
    expect(filterKey({ query: "ดนตรี" })).not.toBe(base);
    expect(filterKey({ upcomingOnly: false })).not.toBe(base);
    expect(filterKey({ limit: 6 })).not.toBe(base);
  });
});

describe("normalizeFilters", () => {
  it("ไม่มีช่องไหนเป็น undefined เพราะ JSON.stringify จะตัดทิ้ง", () => {
    const normalized = normalizeFilters({ provinceSlug: "chonburi" });

    for (const [field, value] of Object.entries(normalized)) {
      expect(value, `ช่อง ${field} ต้องไม่เป็น undefined`).toBeDefined();
    }
  });
});
