import { describe, expect, it } from "vitest";

import { MAP_HEIGHT, MAP_WIDTH } from "@/lib/data/province-paths";
import {
  cameraFitProvince,
  cameraFitProvinces,
  cameraOnProvince,
  cameraWholeCountry,
  clampCamera,
  findNearestProvince,
  mapToScreen,
  pixelsToMapUnits,
  pointMatchesProvince,
  projectToMap,
  toTransform,
  visibleBounds,
  zoomAt,
  zoomBy,
  ZOOM_STEP,
  type Viewport,
} from "@/lib/map-camera";

/** จอมือถือแนวตั้งกับจอเดสก์ท็อปแนวนอน — สองสัดส่วนที่ทำให้กล้องคิดคนละแบบ */
const PHONE: Viewport = { width: 390, height: 700 };
const DESKTOP: Viewport = { width: 1440, height: 742 };

const CHONBURI = "TH-20";
const RAYONG = "TH-21";

describe("projectToMap", () => {
  it("แปลงพิกัดลงในกรอบของแผนที่", () => {
    const point = projectToMap(100.9847, 13.3611); // ตัวเมืองชลบุรี

    expect(point.x).toBeGreaterThan(0);
    expect(point.x).toBeLessThan(MAP_WIDTH);
    expect(point.y).toBeGreaterThan(0);
    expect(point.y).toBeLessThan(MAP_HEIGHT);
  });

  it("ละติจูดมากกว่า = อยู่เหนือกว่า = ค่า y น้อยกว่า", () => {
    const north = projectToMap(100, 18); // เชียงใหม่
    const south = projectToMap(100, 8); // ภาคใต้

    expect(north.y).toBeLessThan(south.y);
  });
});

describe("pointMatchesProvince", () => {
  /*
    สองเคสนี้คือเหตุผลที่ฟังก์ชันนี้ต้องใช้สองวิธีร่วมกัน ไม่ใช่วิธีเดียว
    ทั้งคู่เป็นสถานที่จัดงานยอดนิยมของภาคตะวันออก ถ้าพังคือปฏิเสธคนแจ้งงานที่กรอกถูกทุกอย่าง
  */
  it("พัทยาอยู่ในชลบุรี แม้จะใกล้ตัวเมืองระยองมากกว่า", () => {
    expect(pointMatchesProvince(CHONBURI, 12.888, 100.874)).toBe(true);
  });

  it("เกาะเสม็ดนับเป็นระยอง แม้อยู่นอกรูปหลายเหลี่ยมของจังหวัด", () => {
    expect(pointMatchesProvince(RAYONG, 12.5646, 101.4525)).toBe(true);
  });

  it("พิกัดคนละภาคไม่ผ่านทั้งสองวิธี", () => {
    // ลิงก์เชียงใหม่ แต่ผู้แจ้งเลือกชลบุรี — ต้องค้าน
    expect(pointMatchesProvince(CHONBURI, 18.7883, 98.9853)).toBe(false);
  });

  it("รหัสจังหวัดที่ไม่รู้จักไม่ผ่าน", () => {
    expect(pointMatchesProvince("TH-999", 13.3611, 100.9847)).toBe(false);
  });
});

describe("findNearestProvince", () => {
  it("หาจังหวัดที่ใกล้ที่สุดจากพิกัดตัวเมือง", () => {
    expect(findNearestProvince(12.6814, 101.2816)?.slug).toBe("rayong");
  });

  it("พิกัดนอกประเทศไทยคืน null", () => {
    expect(findNearestProvince(35.6762, 139.6503)).toBeNull(); // โตเกียว
  });
});

describe("clampCamera", () => {
  it("ไม่ให้ซูมเข้าเกินเพดาน", () => {
    const camera = clampCamera({ cx: 300, cy: 550, visibleHeight: 1 }, PHONE);

    expect(camera.visibleHeight).toBeGreaterThanOrEqual(20);
  });

  it("ไม่ให้ซูมออกจนเกินขนาดประเทศ", () => {
    const camera = clampCamera({ cx: 300, cy: 550, visibleHeight: 99_999 }, PHONE);

    expect(camera.visibleHeight).toBeLessThanOrEqual(MAP_HEIGHT);
  });

  it("ลากไปไกลแค่ไหนก็ยังต้องเห็นแผนที่อยู่ในจอ", () => {
    const camera = clampCamera({ cx: 99_999, cy: -99_999, visibleHeight: 300 }, PHONE);
    const bounds = visibleBounds(camera, PHONE);

    // กรอบที่มองเห็นต้องยังคาบเกี่ยวกับตัวแผนที่ ไม่ใช่พื้นว่างล้วน
    expect(bounds.minX).toBeLessThan(MAP_WIDTH);
    expect(bounds.maxX).toBeGreaterThan(0);
    expect(bounds.minY).toBeLessThan(MAP_HEIGHT);
    expect(bounds.maxY).toBeGreaterThan(0);
  });

  it("viewport สูงศูนย์ (ยังวัดไม่ได้) ไม่ทำให้ได้ค่า NaN", () => {
    const camera = clampCamera({ cx: 300, cy: 550, visibleHeight: 300 }, { width: 0, height: 0 });

    expect(Number.isFinite(camera.cx)).toBe(true);
    expect(Number.isFinite(camera.cy)).toBe(true);
    expect(Number.isFinite(camera.visibleHeight)).toBe(true);
  });
});

describe("cameraFitProvince", () => {
  it("ซูมเข้าหาจังหวัดที่เลือก ไม่ถอยกว่าระดับภาค", () => {
    const camera = cameraFitProvince(CHONBURI, PHONE)!;

    expect(camera.visibleHeight).toBeLessThanOrEqual(450);
  });

  it("จอคนละสัดส่วนต้องเห็นจังหวัดครบทั้งคู่ — ความสูงจึงต่างกันได้", () => {
    const phone = cameraFitProvince(CHONBURI, PHONE)!;
    const desktop = cameraFitProvince(CHONBURI, DESKTOP)!;

    // จอแคบต้องถอยมากกว่าเพื่อให้ความกว้างของจังหวัดใส่ได้
    expect(phone.visibleHeight).toBeGreaterThan(desktop.visibleHeight);
  });

  it("รหัสจังหวัดที่ไม่รู้จักคืน null ให้ผู้เรียกตัดสินใจเอง", () => {
    expect(cameraFitProvince("TH-999", PHONE)).toBeNull();
  });
});

describe("cameraFitProvinces", () => {
  it("เห็นทุกจังหวัดในรายการครบ", () => {
    const camera = cameraFitProvinces([CHONBURI, RAYONG], DESKTOP)!;
    const bounds = visibleBounds(camera, DESKTOP);

    for (const code of [CHONBURI, RAYONG]) {
      const focus = cameraOnProvince(code, DESKTOP)!;
      expect(focus.cx).toBeGreaterThanOrEqual(bounds.minX);
      expect(focus.cx).toBeLessThanOrEqual(bounds.maxX);
      expect(focus.cy).toBeGreaterThanOrEqual(bounds.minY);
      expect(focus.cy).toBeLessThanOrEqual(bounds.maxY);
    }
  });

  it("รายการว่างคืน null เพื่อให้ผู้เรียกถอยไปมุมมองทั้งประเทศ", () => {
    expect(cameraFitProvinces([], PHONE)).toBeNull();
  });
});

describe("zoomBy / zoomAt", () => {
  it("ปุ่ม + ซูมเข้า ปุ่ม − ซูมออก", () => {
    const start = { cx: 300, cy: 550, visibleHeight: 300 };

    expect(zoomBy(start, ZOOM_STEP, PHONE).visibleHeight).toBeLessThan(start.visibleHeight);
    expect(zoomBy(start, 1 / ZOOM_STEP, PHONE).visibleHeight).toBeGreaterThan(start.visibleHeight);
  });

  it("หมุนล้อเมาส์แล้วจุดใต้เคอร์เซอร์ต้องอยู่ที่เดิม", () => {
    const camera = { cx: 300, cy: 550, visibleHeight: 300 };
    const anchor = { x: 120, y: 200 };

    // จุดบนแผนที่ที่อยู่ใต้เคอร์เซอร์ก่อนซูม
    const before = {
      x: camera.cx + pixelsToMapUnits(anchor.x - PHONE.width / 2, camera, PHONE),
      y: camera.cy + pixelsToMapUnits(anchor.y - PHONE.height / 2, camera, PHONE),
    };

    const zoomed = zoomAt(camera, 1.18, PHONE, anchor);
    const after = mapToScreen(before, zoomed, PHONE);

    expect(after.x).toBeCloseTo(anchor.x, 1);
    expect(after.y).toBeCloseTo(anchor.y, 1);
  });
});

describe("mapToScreen / pixelsToMapUnits", () => {
  it("แปลงไปกลับแล้วได้ค่าเดิม", () => {
    const camera = { cx: 300, cy: 550, visibleHeight: 300 };
    const point = { x: 320, y: 580 };

    const screen = mapToScreen(point, camera, PHONE);
    const backX = camera.cx + pixelsToMapUnits(screen.x - PHONE.width / 2, camera, PHONE);
    const backY = camera.cy + pixelsToMapUnits(screen.y - PHONE.height / 2, camera, PHONE);

    expect(backX).toBeCloseTo(point.x, 4);
    expect(backY).toBeCloseTo(point.y, 4);
  });

  it("จุดที่กล้องเล็งอยู่ตรงกลางจอพอดี", () => {
    const camera = { cx: 300, cy: 550, visibleHeight: 300 };
    const screen = mapToScreen({ x: camera.cx, y: camera.cy }, camera, PHONE);

    expect(screen.x).toBeCloseTo(PHONE.width / 2);
    expect(screen.y).toBeCloseTo(PHONE.height / 2);
  });
});

describe("toTransform", () => {
  it("ต้องเป็น syntax ของ CSS เท่านั้น — มีจุลภาคคั่นและมีหน่วย px", () => {
    /*
      เขียนแบบ SVG attribute (เว้นวรรค ไม่มีหน่วย) เบราว์เซอร์จะทิ้งทั้ง declaration เงียบๆ
      แล้วแผนที่จะไม่ขยับเลย — เคยพลาดมาแล้วครั้งหนึ่ง เทสต์นี้กันไม่ให้พลาดซ้ำ
    */
    const transform = toTransform(cameraWholeCountry(), PHONE);

    expect(transform).toMatch(/^translate\(-?[\d.]+px, -?[\d.]+px\) scale\([\d.]+\)$/);
  });
});
