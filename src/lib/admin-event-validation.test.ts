import { describe, expect, it } from "vitest";

import { validateAdminEvent } from "@/lib/admin-event-validation";

/**
 * เทสต์ชุดนี้ครอบเฉพาะกฎที่ฟอร์มสาธารณะไม่มี (เวลา ราคา สถานะ ฟิลด์เสริม)
 * ส่วนกฎพื้นฐานที่ใช้ร่วมกันถูกคุมไว้แล้วใน submit-validation.test.ts
 */

interface FormOverrides {
  [key: string]: string | File | boolean | undefined;
}

/** ฟอร์มที่กรอกครบถูกต้อง — แต่ละเทสต์แก้เฉพาะช่องที่สนใจ */
function formOf(overrides: FormOverrides = {}): FormData {
  const base: Record<string, string> = {
    id: "",
    title: "เทศกาลดนตรีชายหาดบางแสน",
    description: "คอนเสิร์ตกลางแจ้งริมหาดบางแสน มีศิลปินท้องถิ่นและร้านอาหารตลอดแนวชายหาด",
    category: "music",
    province: "chonburi",
    district: "เมืองชลบุรี",
    venueName: "ลานหน้าหาดบางแสน",
    address: "ต.แสนสุข",
    mapLink: "",
    startDate: "2026-11-14",
    endDate: "2026-11-14",
    startTime: "18:00",
    endTime: "23:00",
    priceMin: "300",
    priceMax: "800",
    ticketUrl: "",
    organizerName: "เทศบาลเมืองแสนสุข",
    contact: "038-000-000",
    sourceUrl: "",
    status: "approved",
  };

  const data = new FormData();

  for (const [key, value] of Object.entries(base)) {
    if (key in overrides) continue;
    data.set(key, value);
  }

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    // checkbox: เบราว์เซอร์ส่งคีย์มาเฉพาะตอนติ๊ก — false คือไม่มีคีย์นั้นเลย
    if (typeof value === "boolean") {
      if (value) data.set(key, "on");
      continue;
    }
    data.set(key, value);
  }

  return data;
}

describe("validateAdminEvent — ข้อมูลที่ถูกต้อง", () => {
  it("ฟอร์มที่กรอกครบผ่าน และประกอบเวลาเป็นเขตเวลาไทย", () => {
    const result = validateAdminEvent(formOf());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.startAt).toBe("2026-11-14T18:00:00+07:00");
    expect(result.value.endAt).toBe("2026-11-14T23:00:00+07:00");
    expect(result.value.province.code).toBe("TH-20");
    expect(result.value.status).toBe("approved");
  });

  it("งานใหม่ไม่มี id ส่วนงานที่แก้ไขมี", () => {
    expect(validateAdminEvent(formOf()).ok && validateAdminEvent(formOf()).ok).toBe(true);

    const created = validateAdminEvent(formOf());
    if (created.ok) expect(created.value.id).toBeNull();

    const edited = validateAdminEvent(formOf({ id: "abc-123" }));
    if (edited.ok) expect(edited.value.id).toBe("abc-123");
  });

  it("ช่องที่ไม่บังคับปล่อยว่างได้ และกลายเป็น null ไม่ใช่ค่าว่าง", () => {
    const result = validateAdminEvent(
      formOf({ district: "", address: "", organizerName: "", contact: "", ticketUrl: "" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.district).toBeNull();
    expect(result.value.address).toBeNull();
    expect(result.value.organizerName).toBeNull();
    expect(result.value.contact).toBeNull();
    expect(result.value.ticketUrl).toBeNull();
  });

  it("ไม่ระบุวันสิ้นสุด = งานวันเดียว", () => {
    const result = validateAdminEvent(formOf({ endDate: "" }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.endAt.startsWith("2026-11-14")).toBe(true);
  });
});

describe("validateAdminEvent — เวลา", () => {
  it("งานไม่ระบุเวลาใช้ตั้งแต่เที่ยงคืนถึงก่อนเที่ยงคืนวันถัดไป", () => {
    const result = validateAdminEvent(
      formOf({ isAllDay: true, startTime: "", endTime: "", endDate: "2026-11-16" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.isAllDay).toBe(true);
    expect(result.value.startAt).toBe("2026-11-14T00:00:00+07:00");
    expect(result.value.endAt).toBe("2026-11-16T23:59:59+07:00");
  });

  it("งานที่ระบุเวลาแต่ไม่กรอกเวลา", () => {
    const result = validateAdminEvent(formOf({ startTime: "", endTime: "" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.startTime).toBeDefined();
  });

  it("เวลาสิ้นสุดมาก่อนเวลาเริ่มในวันเดียวกัน", () => {
    const result = validateAdminEvent(formOf({ startTime: "20:00", endTime: "18:00" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.endTime).toBeDefined();
  });

  it("เวลาเริ่มเท่ากับเวลาสิ้นสุดในวันเดียวกัน", () => {
    const result = validateAdminEvent(formOf({ startTime: "18:00", endTime: "18:00" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.endTime).toContain("ไม่ระบุเวลา");
  });

  it("งานข้ามคืนมีเวลาจบน้อยกว่าเวลาเริ่มได้ เพราะคนละวัน", () => {
    const result = validateAdminEvent(
      formOf({ startTime: "21:00", endDate: "2026-11-15", endTime: "02:00" }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.startAt).toBe("2026-11-14T21:00:00+07:00");
    expect(result.value.endAt).toBe("2026-11-15T02:00:00+07:00");
  });

  it("เวลาที่ไม่ใช่รูปแบบ HH:MM", () => {
    const result = validateAdminEvent(formOf({ startTime: "หกโมงเย็น" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.startTime).toBeDefined();
  });

  it("วันสิ้นสุดมาก่อนวันเริ่ม", () => {
    const result = validateAdminEvent(formOf({ endDate: "2026-11-10" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.endDate).toBeDefined();
  });

  it("แอดมินกรอกงานย้อนหลังได้ ต่างจากฟอร์มสาธารณะ", () => {
    const result = validateAdminEvent(
      formOf({ startDate: "2020-01-01", endDate: "2020-01-02" }),
    );

    expect(result.ok).toBe(true);
  });
});

describe("validateAdminEvent — ราคา", () => {
  it("ราคาสูงสุดน้อยกว่าราคาต่ำสุด", () => {
    const result = validateAdminEvent(formOf({ priceMin: "800", priceMax: "300" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.priceMax).toBeDefined();
  });

  it("ราคาต่ำสุดเท่าสูงสุดได้ (งานราคาเดียว)", () => {
    const result = validateAdminEvent(formOf({ priceMin: "500", priceMax: "500" }));

    expect(result.ok).toBe(true);
  });

  it("ราคาติดลบ", () => {
    const result = validateAdminEvent(formOf({ priceMin: "-100", priceMax: "" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.priceMin).toBeDefined();
  });

  it("ราคาที่ไม่ใช่ตัวเลข", () => {
    const result = validateAdminEvent(formOf({ priceMin: "สามร้อย", priceMax: "" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.priceMin).toBeDefined();
  });

  it("งานเข้าฟรีล้างราคาที่พิมพ์ค้างไว้ทิ้ง", () => {
    // ผู้ใช้พิมพ์ราคาไปแล้วค่อยติ๊กเข้าฟรี — ข้อมูลที่บันทึกต้องไม่ขัดกันเอง
    const result = validateAdminEvent(formOf({ isFree: true, priceMin: "300", priceMax: "800" }));

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.isFree).toBe(true);
    expect(result.value.priceMin).toBeNull();
    expect(result.value.priceMax).toBeNull();
  });

  it("งานเข้าฟรีไม่สนใจแม้ราคาจะกรอกผิดรูปแบบ", () => {
    const result = validateAdminEvent(formOf({ isFree: true, priceMin: "ฟรี", priceMax: "" }));

    expect(result.ok).toBe(true);
  });

  it("งานเก็บเงินไม่บังคับกรอกราคา — บางงานยังไม่ประกาศ", () => {
    const result = validateAdminEvent(formOf({ priceMin: "", priceMax: "" }));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.priceMin).toBeNull();
  });
});

describe("validateAdminEvent — สถานะและลิงก์", () => {
  it("สถานะที่ไม่รู้จักจาก request ที่แก้เอง", () => {
    const result = validateAdminEvent(formOf({ status: "published" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.status).toBeDefined();
  });

  it("archived ไม่ใช่สถานะที่ฟอร์มเปิดรับ", () => {
    expect(validateAdminEvent(formOf({ status: "archived" })).ok).toBe(false);
  });

  it("ลิงก์บัตรที่ไม่ใช่ http/https", () => {
    const result = validateAdminEvent(formOf({ ticketUrl: "javascript:alert(1)" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.ticketUrl).toBeDefined();
  });

  it("จังหวัดนอกภาคที่เปิดรับ — กฎเดียวกับฟอร์มสาธารณะ", () => {
    const result = validateAdminEvent(formOf({ province: "chiang-mai" }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.province).toContain("ภาคตะวันออก");
  });
});
