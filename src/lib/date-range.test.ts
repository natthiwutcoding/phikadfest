import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { parseDateRange, resolveDateRange } from "@/lib/date-range";

describe("parseDateRange", () => {
  it("รับค่าที่รู้จัก", () => {
    expect(parseDateRange("week")).toBe("week");
    expect(parseDateRange("month")).toBe("month");
    expect(parseDateRange("all")).toBe("all");
  });

  it("ค่าขยะจาก URL ที่ผู้ใช้แก้เองกลายเป็นค่าตั้งต้น ไม่ใช่ทำหน้าพัง", () => {
    expect(parseDateRange("'; DROP TABLE events;--")).toBe("all");
    expect(parseDateRange(undefined)).toBe("all");
    expect(parseDateRange("")).toBe("all");
  });
});

describe("resolveDateRange", () => {
  beforeEach(() => {
    // 3 ก.ย. 18:30 UTC = 4 ก.ย. 01:30 ที่ไทย — ช่วงที่วัน UTC กับวันไทยไม่ตรงกัน
    vi.useFakeTimers().setSystemTime(new Date("2026-09-03T18:30:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("ทั้งหมด = ไม่จำกัดช่วงวัน", () => {
    expect(resolveDateRange("all")).toEqual({});
  });

  it("นับ 'วันนี้' ตามปฏิทินไทย ไม่ใช่ UTC", () => {
    expect(resolveDateRange("week").from).toBe("2026-09-04");
  });

  it("ใน 7 วัน คือหน้าต่างเลื่อนเจ็ดวันนับจากวันนี้", () => {
    expect(resolveDateRange("week")).toEqual({ from: "2026-09-04", to: "2026-09-11" });
  });

  it("ใน 1 เดือน ใช้ 30 วัน ไม่ใช่เดือนตามปฏิทิน", () => {
    expect(resolveDateRange("month")).toEqual({ from: "2026-09-04", to: "2026-10-04" });
  });
});
