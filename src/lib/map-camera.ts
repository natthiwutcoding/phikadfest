import { PROVINCES } from "@/lib/data/provinces";
import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PROVINCE_BBOXES,
  PROVINCE_LABEL_ANCHORS,
} from "@/lib/data/province-paths";
import { haversineMeters } from "@/lib/geo";
import type { Province } from "@/lib/types";

/**
 * คณิตศาสตร์ของกล้องแผนที่ — แยกออกมาเป็นฟังก์ชันบริสุทธิ์ทั้งหมด
 * ตัว component เหลือแค่เรื่อง state กับ event ส่วนการคำนวณอยู่ที่นี่
 *
 * ── ทำไมกล้องเก็บ "ความสูงที่มองเห็น" แทนที่จะเก็บ scale ตรงๆ ──
 *
 * SVG ใช้ preserveAspectRatio="xMidYMid slice" คือขยายให้เต็มกรอบเสมอแล้วครอบตัดส่วนเกิน
 * ผลข้างเคียงคือ scale ค่าเดียวกันให้ผลต่างกันคนละเรื่องตามสัดส่วนจอ:
 * บนจอเดสก์ท็อปแนวนอน scale 3.5 เห็นแผนที่แค่ ~90 หน่วยแนวตั้ง แต่บนมือถือเห็นถึง ~300 หน่วย
 *
 * จึงเก็บกล้องเป็น "อยากเห็นแผนที่สูงกี่หน่วย" ซึ่งไม่ขึ้นกับขนาดจอ
 * แล้วค่อยแปลงเป็น scale ตอน render โดยใช้ขนาดกรอบที่วัดได้จริง
 * ผลคือกรอบภาพคงที่ทุกอุปกรณ์ และย่อ/ขยายหน้าต่างแล้วมุมมองไม่เพี้ยน
 */

/** จุดที่กล้องเล็ง (พิกัด viewBox) และขอบเขตที่อยากเห็น (หน่วยแผนที่ ไม่ใช่พิกเซล) */
export interface Camera {
  cx: number;
  cy: number;
  /** อยากให้มองเห็นแผนที่สูงกี่หน่วย — ยิ่งน้อยยิ่งซูมเข้า */
  visibleHeight: number;
}

/** ขนาดกรอบแผนที่บนจอ หน่วยพิกเซล */
export interface Viewport {
  width: number;
  height: number;
}

/** ซูมเข้าสุด — กันจังหวัดเล็ก (ภูเก็ตสูงแค่ 32 หน่วย) ซูมจนรูปร่างแตก */
const MIN_VISIBLE_HEIGHT = 45;

/** ซูมออกสุด — เห็นทั้งประเทศพอดี */
const MAX_VISIBLE_HEIGHT = MAP_HEIGHT;

/**
 * ระดับ "เห็นประมาณหนึ่งภาค" — ค่าตั้งต้นตอนเข้าหน้าแผนที่
 *
 * ตั้งไว้ 450 ไม่ใช่ ~330 ที่แค่พอดีขอบภาค เพราะต้องกว้างกว่าจังหวัดที่ใหญ่ที่สุด
 * อย่างชัดเจน (เชียงใหม่ต้องใช้ราว 335 หน่วย) ไม่งั้นกดจังหวัดใหญ่แล้วภาพจะไม่ขยับเลย
 * เพราะมุมมองภาคกับมุมมองจังหวัดเท่ากันพอดี — และตอนกดซ้ำเพื่อซูมออกก็จะไม่เห็นความต่าง
 */
const REGION_VISIBLE_HEIGHT = 450;

/** ปุ่ม + / − ย่อ-ขยายมุมมองทีละเท่านี้ */
export const ZOOM_STEP = 1.6;

/** เผื่อขอบรอบจังหวัดตอนซูมเข้า — 1 คือชิดพอดี มากกว่านั้นเห็นจังหวัดข้างเคียงด้วย */
const PROVINCE_ZOOM_PADDING = 1.5;

/** ไกลกว่านี้จากทุกจังหวัดถือว่าอยู่นอกประเทศไทย */
const MAX_DISTANCE_FROM_THAILAND_M = 300_000;

const MAP_CENTER_X = MAP_WIDTH / 2;
const MAP_CENTER_Y = MAP_HEIGHT / 2;

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/**
 * จำนวนพิกเซลต่อหนึ่งหน่วยแผนที่ ตอนที่ยังไม่ได้ซูม (scale = 1)
 *
 * มาจากนิยามของ preserveAspectRatio="slice" ที่ขยายให้ "คลุม" กรอบ
 * จึงใช้ค่าที่มากกว่าระหว่างสองแกน (เหมือน background-size: cover)
 */
function coverFactor(viewport: Viewport): number {
  return Math.max(viewport.width / MAP_WIDTH, viewport.height / MAP_HEIGHT);
}

/** แปลง "อยากเห็นสูงกี่หน่วย" เป็นค่า scale ที่ใช้กับ CSS transform จริง */
function scaleFor(camera: Camera, viewport: Viewport): number {
  if (viewport.height === 0) return 1;
  return viewport.height / (coverFactor(viewport) * camera.visibleHeight);
}

/** ความกว้างของแผนที่ที่มองเห็น คำนวณจากความสูงและสัดส่วนกรอบ */
function visibleWidth(camera: Camera, viewport: Viewport): number {
  if (viewport.height === 0) return camera.visibleHeight;
  return camera.visibleHeight * (viewport.width / viewport.height);
}

/**
 * แปลงกล้องเป็นค่า CSS transform
 *
 * ⚠️ ต้องเป็น syntax ของ CSS เท่านั้น — มีจุลภาคคั่นและมีหน่วย px
 * ถ้าเขียนแบบ SVG attribute (`translate(10 20)` เว้นวรรค ไม่มีหน่วย)
 * เบราว์เซอร์จะถือว่า declaration ผิดแล้วทิ้งทั้งบรรทัดเงียบๆ แผนที่จะไม่ขยับเลย
 * (เคยพลาดมาแล้วครั้งหนึ่ง — ตรวจค่า computed style ในเบราว์เซอร์ทุกครั้งที่แก้ตรงนี้)
 *
 * หน่วย px ที่นี่นับตามระบบพิกัด viewBox ไม่ใช่พิกเซลจริงบนจอ
 * เพราะตั้ง transform-box: view-box ไว้ใน globals.css
 */
export function toTransform(camera: Camera, viewport: Viewport): string {
  const scale = scaleFor(camera, viewport);
  const translateX = MAP_CENTER_X - camera.cx * scale;
  const translateY = MAP_CENTER_Y - camera.cy * scale;
  return `translate(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px) scale(${scale.toFixed(4)})`;
}

/**
 * สัดส่วนของหน้าจอที่ต้องมีแผนที่อยู่เสมอ ป้องกันการลากจนเหลือแต่พื้นว่าง
 *
 * แยกค่าสองแกนเพราะประเทศไทยแคบแต่สูง (600 x 1108 หน่วย) แนวนอนจึงชนกรอบ
 * เร็วกว่าแนวตั้งมากถ้าใช้ค่าเดียวกัน จึงตั้งแนวนอนให้หลวมกว่าเพื่อให้เลื่อนซ้ายขวาได้อิสระขึ้น
 */
const MIN_MAP_ON_SCREEN_X = 0.22;
const MIN_MAP_ON_SCREEN_Y = 0.4;

/**
 * ตอนซูมออกจนเห็นแผนที่ครบทั้งอันแล้ว ยังให้ไถลออกจากกลางจอได้ไกลสุดเท่านี้
 * (คิดเป็นสัดส่วนของขนาดแผนที่) เผื่อผู้ใช้อยากเลื่อนแผนที่ออกจากใต้แผงรายละเอียด
 */
const MAX_SLIDE_RATIO = 0.5;

/** บีบตำแหน่งกล้องหนึ่งแกน ไม่ให้ลากจนแผนที่หลุดออกนอกจอเหลือแต่พื้นว่าง */
function clampAxis(
  center: number,
  visible: number,
  mapSize: number,
  minOnScreen: number,
): number {
  // ซูมออกจนเห็นแผนที่ครบทั้งอันแล้ว — ยังเลื่อนได้ แต่ต้องเห็นครบเสมอ
  // ไม่ล็อกตายไว้กลางเหมือนเดิม เพราะทำให้เลื่อนแนวนอนไม่ได้เลยบนจอกว้าง
  if (visible >= mapSize) {
    const slide = Math.min((visible - mapSize) / 2, mapSize * MAX_SLIDE_RATIO);
    return clamp(center, mapSize / 2 - slide, mapSize / 2 + slide);
  }

  const required = visible * minOnScreen;
  return clamp(center, required - visible / 2, mapSize - required + visible / 2);
}

/** บีบกล้องให้อยู่ในกรอบที่ยังเห็นประเทศ และระดับซูมอยู่ในช่วงที่กำหนด */
export function clampCamera(camera: Camera, viewport: Viewport): Camera {
  const height = clamp(camera.visibleHeight, MIN_VISIBLE_HEIGHT, MAX_VISIBLE_HEIGHT);
  const width = visibleWidth({ ...camera, visibleHeight: height }, viewport);

  return {
    visibleHeight: height,
    cx: clampAxis(camera.cx, width, MAP_WIDTH, MIN_MAP_ON_SCREEN_X),
    cy: clampAxis(camera.cy, height, MAP_HEIGHT, MIN_MAP_ON_SCREEN_Y),
  };
}

/**
 * จุดที่กล้องควรเล็งเมื่อโฟกัสจังหวัดหนึ่ง
 *
 * ใช้จุดเดียวกับที่วางชื่อจังหวัด (จุดที่อยู่ลึกที่สุดในเขต) ไม่ใช่จุดกึ่งกลางกรอบสี่เหลี่ยม
 * เพราะจังหวัดรูปร่างเบี้ยวอย่างตาก ประจวบคีรีขันธ์ หนองคาย และสุพรรณบุรี
 * มีจุดกึ่งกลางกรอบอยู่นอกเขตจังหวัดเลย ทำให้กดแล้วกล้องไปจอดที่จังหวัดข้างเคียง
 * (ตากห่างถึง 42 หน่วย) และตอนกดซ้ำเพื่อซูมออกก็ซูมออกจากจุดที่ผิดตามไปด้วย
 */
function focusPoint(code: string): { cx: number; cy: number } | null {
  const anchor = PROVINCE_LABEL_ANCHORS[code];
  if (anchor) return { cx: anchor[0], cy: anchor[1] };

  const bbox = PROVINCE_BBOXES[code];
  if (!bbox) return null;

  const [x, y, width, height] = bbox;
  return { cx: x + width / 2, cy: y + height / 2 };
}

/** กล้องที่เล็งไปที่จังหวัด ที่ระดับซูม "เห็นประมาณหนึ่งภาค" */
export function cameraOnProvince(code: string, viewport: Viewport): Camera | null {
  const focus = focusPoint(code);
  if (!focus) return null;

  return clampCamera({ ...focus, visibleHeight: REGION_VISIBLE_HEIGHT }, viewport);
}

/** กล้องที่ซูมเข้าให้พอดีกับจังหวัด — ใช้ตอนกดเลือกจังหวัด */
export function cameraFitProvince(code: string, viewport: Viewport): Camera | null {
  const bbox = PROVINCE_BBOXES[code];
  const focus = focusPoint(code);
  if (!bbox || !focus) return null;

  const [, , width, height] = bbox;
  const aspect = viewport.height > 0 ? viewport.width / viewport.height : 1;

  // ต้องพอดีทั้งสองแกน จึงเลือกความสูงที่มากกว่าระหว่าง
  // "สูงพอใส่จังหวัด" กับ "สูงพอที่ความกว้างจะใส่จังหวัดได้"
  const neededHeight = Math.max(
    height * PROVINCE_ZOOM_PADDING,
    (width * PROVINCE_ZOOM_PADDING) / aspect,
  );

  return clampCamera(
    {
      ...focus,
      // ไม่ให้ซูมออกกว่าระดับภาค ไม่งั้นกดจังหวัดใหญ่แล้วจะเหมือนซูมถอยหลัง
      visibleHeight: Math.min(neededHeight, REGION_VISIBLE_HEIGHT),
    },
    viewport,
  );
}

/** ปรับระดับซูมโดยยังเล็งจุดเดิม — ใช้กับปุ่ม + / − */
export function zoomBy(camera: Camera, factor: number, viewport: Viewport): Camera {
  return clampCamera({ ...camera, visibleHeight: camera.visibleHeight / factor }, viewport);
}

/**
 * ซูมโดยตรึงจุดใต้เคอร์เซอร์ไว้ที่เดิม — ใช้กับการหมุนล้อเมาส์
 *
 * ต่างจาก zoomBy ที่ซูมเข้าหากลางจอเสมอ อันนี้ทำให้ความรู้สึกเหมือนแอปแผนที่จริง
 * คือชี้ไปตรงไหนแล้วหมุนล้อ ตรงนั้นจะอยู่กับที่ ไม่ไหลหนีออกนอกจอ
 *
 * anchor เป็นพิกัดพิกเซลเทียบกับมุมซ้ายบนของกรอบแผนที่
 */
export function zoomAt(
  camera: Camera,
  factor: number,
  viewport: Viewport,
  anchor: { x: number; y: number },
): Camera {
  const zoomed = clampCamera(
    { ...camera, visibleHeight: camera.visibleHeight / factor },
    viewport,
  );

  // ระยะจากกลางจอถึงเคอร์เซอร์ หน่วยพิกเซล
  const offsetX = anchor.x - viewport.width / 2;
  const offsetY = anchor.y - viewport.height / 2;

  // ระยะเดียวกันนี้คิดเป็นหน่วยแผนที่ ก่อนและหลังซูม
  const beforeX = pixelsToMapUnits(offsetX, camera, viewport);
  const beforeY = pixelsToMapUnits(offsetY, camera, viewport);
  const afterX = pixelsToMapUnits(offsetX, zoomed, viewport);
  const afterY = pixelsToMapUnits(offsetY, zoomed, viewport);

  // ขยับกล้องชดเชยส่วนต่าง จุดใต้เคอร์เซอร์จึงอยู่ที่เดิม
  return clampCamera(
    {
      ...zoomed,
      cx: camera.cx + beforeX - afterX,
      cy: camera.cy + beforeY - afterY,
    },
    viewport,
  );
}

/** ขอบเขตของแผนที่ที่มองเห็นอยู่ — ใช้คัดว่าจะวาดชื่อจังหวัดไหนบ้าง */
export function visibleBounds(camera: Camera, viewport: Viewport) {
  const halfWidth = visibleWidth(camera, viewport) / 2;
  const halfHeight = camera.visibleHeight / 2;

  return {
    minX: camera.cx - halfWidth,
    maxX: camera.cx + halfWidth,
    minY: camera.cy - halfHeight,
    maxY: camera.cy + halfHeight,
  };
}

/** มุมมองทั้งประเทศ */
export function cameraWholeCountry(): Camera {
  return { cx: MAP_CENTER_X, cy: MAP_CENTER_Y, visibleHeight: MAX_VISIBLE_HEIGHT };
}

/** แปลงระยะที่ลากบนจอ (พิกเซล) เป็นระยะในระบบพิกัดแผนที่ */
export function pixelsToMapUnits(deltaPx: number, camera: Camera, viewport: Viewport): number {
  const scale = scaleFor(camera, viewport);
  const factor = coverFactor(viewport) * scale;
  return factor === 0 ? deltaPx : deltaPx / factor;
}

/**
 * หาจังหวัดที่ใกล้พิกัดที่สุด โดยเทียบกับพิกัดตัวเมืองของแต่ละจังหวัด
 *
 * ข้อจำกัดที่ยอมรับได้: ใช้จุดกึ่งกลางจังหวัด ไม่ใช่ขอบเขตจริง คนที่อยู่ติดรอยต่อจังหวัด
 * อาจได้จังหวัดข้างเคียง ซึ่งผลกระทบแค่กล้องไปจอดคลาดไปนิดหน่อย
 * ไม่คุ้มที่จะทำ point-in-polygon ซึ่งต้องส่งข้อมูลขอบเขตไปเบราว์เซอร์เพิ่มอีกเท่าตัว
 *
 * คืน null เมื่ออยู่นอกประเทศไทย
 */
export function findNearestProvince(lat: number, lng: number): Province | null {
  let nearest: Province | null = null;
  let shortestDistance = Infinity;

  for (const province of PROVINCES) {
    const distance = haversineMeters(lat, lng, province.lat, province.lng);
    if (distance < shortestDistance) {
      shortestDistance = distance;
      nearest = province;
    }
  }

  return shortestDistance <= MAX_DISTANCE_FROM_THAILAND_M ? nearest : null;
}
