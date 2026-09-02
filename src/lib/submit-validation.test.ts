import { describe, expect, it } from "vitest";

import { validateSubmission } from "@/lib/submit-validation";

/**
 * ตัวตรวจฟอร์มคือด่านจริงของข้อมูลที่จะขึ้นเว็บ — ผู้ใช้ยิง request ตรงมาโดยข้าม HTML ได้
 * เทสต์ชุดนี้จึงคุมทั้งสองฝั่ง: ข้อมูลถูกต้องต้องผ่าน และข้อมูลผิดต้องถูกปฏิเสธพร้อมชี้ช่องที่ผิด
 */

/** ฟอร์มที่กรอกครบถูกต้อง — เทสต์แต่ละข้อค่อยแก้เฉพาะช่องที่สนใจ */
function formOf(overrides: Record<string, string | File> = {}): FormData {
  const data = new FormData();
  const fields: Record<string, string> = {
    title: "งานลอยกระทงบางแสน 2569",
    description: "งานลอยกระทงริมหาดบางแสน มีขบวนแห่ ประกวดนางนพมาศ และร้านอาหารท้องถิ่นตลอดแนวหาด",
    category: "culture",
    province: "chonburi",
    venueName: "หาดบางแสน",
    startDate: "2026-11-14",
    endDate: "2026-11-15",
    contact: "089-123-4567",
    sourceUrl: "",
    mapLink: "",
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => typeof value === "string"),
    ),
  };

  for (const [key, value] of Object.entries(fields)) data.set(key, value);

  for (const [key, value] of Object.entries(overrides)) {
    if (value instanceof File) data.set(key, value);
  }

  return data;
}

/** เวลาอ้างอิงกลางวันตามเวลาไทย — ใช้กับเทสต์ที่ไม่ได้สนใจเรื่องเขตเวลา */
const NOW = new Date("2026-09-03T12:00:00+07:00");

describe("validateSubmission — ข้อมูลที่ถูกต้อง", () => {
  it("ฟอร์มที่กรอกครบผ่านทั้งหมด", () => {
    const result = validateSubmission(formOf(), NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value.title).toBe("งานลอยกระทงบางแสน 2569");
    // คืนเป็น object ที่หาเจอแล้ว ผู้เรียกจึงไม่ต้อง lookup ซ้ำ
    expect(result.value.province.code).toBe("TH-20");
    expect(result.value.category.slug).toBe("culture");
  });

  it("งานวันเดียวใช้วันเริ่มเป็นวันจบ", () => {
    const result = validateSubmission(formOf({ endDate: "" }), NOW);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.endDate).toBe(result.value.startDate);
  });

  it("ตัดช่องว่างหัวท้ายที่ผู้ใช้ก๊อปมาติด", () => {
    const result = validateSubmission(formOf({ title: "  งานตัวอย่างของจริง  " }), NOW);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.title).toBe("งานตัวอย่างของจริง");
  });
});

describe("validateSubmission — วันที่", () => {
  it("งานที่ผ่านมานานแล้วถูกปฏิเสธ", () => {
    const result = validateSubmission(formOf({ startDate: "2026-08-01", endDate: "" }), NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.startDate).toBeDefined();
  });

  it("งานที่เพิ่งจบเมื่อวานยังส่งได้ เผื่อคนแจ้งย้อนหลังนิดหน่อย", () => {
    const result = validateSubmission(formOf({ startDate: "2026-09-02", endDate: "" }), NOW);

    expect(result.ok).toBe(true);
  });

  it("ช่วงตีหนึ่งตามเวลาไทยต้องนับวันแบบไทย ไม่ใช่ UTC", () => {
    /*
      เคสจริงที่เคยหลุด: 3 ก.ย. 18:30 UTC = 4 ก.ย. 01:30 ที่ไทย

      ถ้าคำนวณ "เมื่อวาน" ด้วย toISOString() จะได้ 2 ก.ย. ทำให้ยอมรับงานที่จบไปสองวันแล้ว
      ค่าที่ถูกคือ 3 ก.ย. (เมื่อวานของวันที่ 4 ตามปฏิทินไทย)
    */
    const earlyMorningInThailand = new Date("2026-09-03T18:30:00Z");

    expect(
      validateSubmission(formOf({ startDate: "2026-09-03", endDate: "" }), earlyMorningInThailand)
        .ok,
    ).toBe(true);

    expect(
      validateSubmission(formOf({ startDate: "2026-09-02", endDate: "" }), earlyMorningInThailand)
        .ok,
    ).toBe(false);
  });

  it("ไม่เลือกวันเริ่มเลย", () => {
    const result = validateSubmission(formOf({ startDate: "", endDate: "" }), NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.startDate).toBeDefined();
  });

  it("วันสิ้นสุดมาก่อนวันเริ่ม", () => {
    const result = validateSubmission(
      formOf({ startDate: "2026-11-14", endDate: "2026-11-10" }),
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.endDate).toBeDefined();
  });
});

describe("validateSubmission — จังหวัดและหมวดหมู่", () => {
  it("จังหวัดนอกภาคที่เปิดรับถูกปฏิเสธ แม้ dropdown จะถูกแก้มา", () => {
    const result = validateSubmission(formOf({ province: "chiang-mai" }), NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.province).toContain("ภาคตะวันออก");
  });

  it("จังหวัดที่ไม่มีอยู่จริง", () => {
    const result = validateSubmission(formOf({ province: "ไม่มีจังหวัดนี้" }), NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.province).toBeDefined();
  });

  it("หมวดหมู่ที่ไม่มีอยู่จริง", () => {
    const result = validateSubmission(formOf({ category: "not-a-category" }), NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.category).toBeDefined();
  });
});

describe("validateSubmission — ข้อความ", () => {
  it("ชื่องานสั้นเกินไป", () => {
    const result = validateSubmission(formOf({ title: "งาน" }), NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.title).toBeDefined();
  });

  it("ชื่องานยาวเกิน 200 ตัวอักษร", () => {
    const result = validateSubmission(formOf({ title: "ก".repeat(201) }), NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.title).toContain("ยาวเกินไป");
  });

  it("รายละเอียดสั้นเกินไป", () => {
    const result = validateSubmission(formOf({ description: "มางานนะ" }), NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.description).toBeDefined();
  });

  it("ไม่ใส่ช่องทางติดต่อ", () => {
    const result = validateSubmission(formOf({ contact: "" }), NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.contact).toBeDefined();
  });

  it("ลิงก์ประกาศงานที่ไม่ใช่ http/https", () => {
    const result = validateSubmission(formOf({ sourceUrl: "javascript:alert(1)" }), NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.sourceUrl).toBeDefined();
  });

  it("ไม่ใส่ลิงก์ประกาศงานก็ผ่าน เพราะเป็นช่องไม่บังคับ", () => {
    expect(validateSubmission(formOf({ sourceUrl: "" }), NOW).ok).toBe(true);
  });
});

describe("validateSubmission — รูปปก", () => {
  const jpeg = (bytes: number, type = "image/jpeg") =>
    new File([new Uint8Array(bytes)], "cover.jpg", { type });

  it("ไฟล์ JPG ขนาดปกติผ่าน พร้อมบอกนามสกุลให้ผู้เรียกใช้ตั้งชื่อไฟล์", () => {
    const result = validateSubmission(formOf({ coverImage: jpeg(1024) }), NOW);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.coverImage?.extension).toBe("jpg");
  });

  it("ไฟล์ว่างที่เบราว์เซอร์แนบมาตอนไม่ได้เลือกรูป ถือว่าไม่มีรูป", () => {
    const result = validateSubmission(formOf({ coverImage: jpeg(0) }), NOW);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.coverImage).toBeNull();
  });

  it("ชนิดไฟล์ที่ไม่รองรับ", () => {
    const result = validateSubmission(
      formOf({ coverImage: jpeg(1024, "application/pdf") }),
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.coverImage).toBeDefined();
  });

  it("ไฟล์ใหญ่เกิน 5MB", () => {
    const result = validateSubmission(formOf({ coverImage: jpeg(5 * 1024 * 1024 + 1) }), NOW);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.coverImage).toContain("5MB");
  });
});

describe("validateSubmission — รายงานข้อผิดพลาด", () => {
  it("บอกทุกช่องที่ผิดในครั้งเดียว ไม่ให้ผู้ใช้แก้ทีละรอบ", () => {
    const result = validateSubmission(
      formOf({ title: "สั้น", description: "สั้น", contact: "" }),
      NOW,
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(Object.keys(result.errors).sort()).toEqual(["contact", "description", "title"]);
    }
  });
});
