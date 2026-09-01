import { PROVINCES } from "@/lib/data/provinces";
import {
  MAP_HEIGHT,
  MAP_PROJECTION,
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

/**
 * ซูมเข้าสุด — เห็นพื้นที่สูงราว 30 กม. ประมาณขนาดเมืองพัทยาทั้งเมือง
 *
 * เคยตั้งไว้ที่ 130 (~194 กม.) ด้วยเหตุผลว่าซูมลึกกว่านั้นจะเจอแต่พื้นที่สีเรียบๆ ไม่มีอะไรดู
 * **เหตุผลนั้นใช้ไม่ได้แล้ว** เพราะตอนนี้แผนที่มีหมุดงานและชื่องานข้างหมุด — และการซูมลึก
 * คือวิธีเดียวที่ทำให้กลุ่มหมุดที่ทับกันแตกออกจากกัน
 *
 * ผลพลอยได้ที่สำคัญ: ช่องจัดกลุ่มหมุด (CLUSTER_CELL_PX ใน thailand-map.tsx) ที่ระดับนี้
 * เท่ากับราว 1.8 กม. จากเดิม ~11 กม. งานคนละที่ในเมืองเดียวกันจึงแยกหมุดออกจากกันได้จริง
 */
const MIN_VISIBLE_HEIGHT = 20;

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

/**
 * เผื่อขอบรอบทั้งภาค — น้อยกว่าของจังหวัดเดียวมาก
 *
 * พื้นที่ระดับภาคกว้างอยู่แล้ว ถ้าเผื่อเท่าจังหวัด (1.5) ภาพจะถอยห่างจนภาคที่เป็นพระเอก
 * กลายเป็นจุดเล็กๆ กลางประเทศ ตั้ง 1.12 ให้เห็นขอบภาคครบพร้อมบริบทรอบข้างนิดหน่อย
 */
const REGION_ZOOM_PADDING = 1.12;

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

/**
 * กล้องที่เล็งจุดใดจุดหนึ่งบนแผนที่ ที่ระดับซูมที่ขอมา
 *
 * ใช้ตอนกดกลุ่มหมุดเพื่อซูมเข้าไปดูสมาชิกข้างใน ต่างจาก cameraOnProvince ตรงที่
 * เล็งพิกัดตรงๆ ไม่ผูกกับจังหวัด และผู้เรียกเป็นคนกำหนดระดับซูมเอง
 *
 * ค่าที่ขอมาถูก clampCamera บีบให้อยู่ในเพดานเสมอ ผู้เรียกจึงต้องอ่านค่าที่คืนกลับไป
 * ไปคิดต่อ ไม่ใช่สมมติว่าได้ visibleHeight ตามที่ขอ
 */
export function cameraOnPoint(
  point: { x: number; y: number },
  visibleHeight: number,
  viewport: Viewport,
): Camera {
  return clampCamera({ cx: point.x, cy: point.y, visibleHeight }, viewport);
}

/**
 * กล้องที่ซูมให้เห็นทุกจังหวัดในรายการพอดี — ใช้ตั้งมุมมองเริ่มต้นของภาคที่เปิดรับงาน
 *
 * รวม bounding box ของทุกจังหวัดเข้าด้วยกันก่อน แล้วค่อยคำนวณแบบเดียวกับ cameraFitProvince
 * ต่างกันแค่ที่ "ไม่จำกัดด้วย REGION_VISIBLE_HEIGHT" เพราะภาคย่อมกว้างกว่าจังหวัดเดียวเสมอ
 * ถ้าไปตัดด้วยเพดานนั้นจะเห็นไม่ครบทั้งภาค
 *
 * เล็งกึ่งกลาง bbox รวม ไม่ใช่ pole of inaccessibility เหมือนตอนโฟกัสจังหวัดเดียว
 * เพราะที่นี่ต้องการ "เห็นครบ" ไม่ใช่ "เล็งให้ตรงกลางพื้นที่"
 */
export function cameraFitProvinces(codes: string[], viewport: Viewport): Camera | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const code of codes) {
    const bbox = PROVINCE_BBOXES[code];
    if (!bbox) continue;

    const [x, y, width, height] = bbox;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  if (!Number.isFinite(minX)) return null;

  const width = maxX - minX;
  const height = maxY - minY;
  const aspect = viewport.height > 0 ? viewport.width / viewport.height : 1;

  return clampCamera(
    {
      cx: minX + width / 2,
      cy: minY + height / 2,
      // ต้องพอดีทั้งสองแกน เหมือน cameraFitProvince — เลือกความสูงที่มากกว่าระหว่าง
      // "สูงพอใส่พื้นที่" กับ "สูงพอที่ความกว้างจะใส่พื้นที่ได้"
      visibleHeight: Math.max(
        height * REGION_ZOOM_PADDING,
        (width * REGION_ZOOM_PADDING) / aspect,
      ),
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

/**
 * แปลงพิกัดภูมิศาสตร์ (lat/lng) เป็นตำแหน่งบนแผนที่ SVG
 *
 * ⚠️ สูตรตรงนี้ต้องเหมือนกับใน scripts/build-province-paths.mjs ทุกตัวอักษร
 * เพราะรูปร่างจังหวัดถูกแปลงด้วยสูตรนั้นตอน build ถ้าที่นี่คำนวณต่างไปแม้นิดเดียว
 * หมุดงานจะไม่ตรงกับจังหวัดที่มันควรอยู่ — ค่าคงที่จึงดึงมาจากไฟล์ที่ generate มาด้วยกัน
 */
export function projectToMap(lng: number, lat: number): { x: number; y: number } {
  const x = (lng + 180) / 360;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);

  return {
    x: (x - MAP_PROJECTION.minX) * MAP_PROJECTION.scale,
    y: (y - MAP_PROJECTION.minY) * MAP_PROJECTION.scale,
  };
}

/**
 * แปลงตำแหน่งบนแผนที่กลับเป็นพิกเซลบนจอ
 *
 * ใช้วางการ์ดงาน (HTML) ให้ตรงกับหมุด (SVG) เพราะทั้งสองอยู่คนละระบบพิกัด
 * เป็นผกผันของการ transform ที่ใช้ใน toTransform()
 */
export function mapToScreen(
  point: { x: number; y: number },
  camera: Camera,
  viewport: Viewport,
): { x: number; y: number } {
  const factor = coverFactor(viewport) * scaleFor(camera, viewport);

  return {
    x: viewport.width / 2 + (point.x - camera.cx) * factor,
    y: viewport.height / 2 + (point.y - camera.cy) * factor,
  };
}

/** แปลงระยะที่ลากบนจอ (พิกเซล) เป็นระยะในระบบพิกัดแผนที่ */
export function pixelsToMapUnits(deltaPx: number, camera: Camera, viewport: Viewport): number {
  const scale = scaleFor(camera, viewport);
  const factor = coverFactor(viewport) * scale;
  return factor === 0 ? deltaPx : deltaPx / factor;
}

/**
 * พิกัดนี้อยู่ในกรอบสี่เหลี่ยมของจังหวัดนี้หรือไม่
 *
 * ── ทำไมไม่ใช้ findNearestProvince ตรวจแทน ──
 * findNearestProvince เทียบกับ "พิกัดตัวเมือง" ซึ่งพลาดกับจังหวัดที่ตัวเมืองอยู่สุดขอบ
 * ตัวอย่างจริง: พัทยา/จอมเทียน (12.888, 100.874) อยู่ในชลบุรีแน่นอน แต่ห่างจากตัวเมือง
 * ชลบุรี 54 กม. ขณะที่ห่างจากตัวเมืองระยองแค่ 50 กม. — ฟังก์ชันนั้นจึงตอบว่า "ระยอง"
 *
 * เรื่องนี้สำคัญมากกับฟอร์มแจ้งงาน เพราะพัทยาคือสถานที่จัดงานที่คนแจ้งเข้ามาบ่อยที่สุด
 * ในภาคตะวันออก ถ้าใช้ระยะทางตัดสิน คนแจ้งงานพัทยาจะถูกปฏิเสธทั้งที่กรอกถูกทุกอย่าง
 *
 * ── ทำไมใช้แค่กรอบสี่เหลี่ยม ไม่ใช่รูปร่างจริง ──
 * ต้องการแค่ "ค้านเมื่อผิดจังหวัดแบบชัดเจน" ไม่ได้ต้องการความแม่นระดับเส้นเขตแดน
 * กรอบสี่เหลี่ยมกว้างกว่าเขตจริงเล็กน้อย จึงอนุโลมจุดที่อยู่ริมขอบให้ผ่าน ซึ่งเป็นฝั่งที่
 * ปลอดภัยกว่าสำหรับฟอร์มสาธารณะ — ปฏิเสธงานจริงผิดๆ เสียหายกว่ารับงานที่พิกัดคลาดไปนิด
 */
function isPointInProvinceBounds(code: string, lat: number, lng: number): boolean {
  const bbox = PROVINCE_BBOXES[code];
  if (!bbox) return false;

  const [x, y, width, height] = bbox;
  const point = projectToMap(lng, lat);

  return point.x >= x && point.x <= x + width && point.y >= y && point.y <= y + height;
}

/**
 * พิกัดนี้เข้ากันได้กับจังหวัดที่ผู้ใช้เลือกหรือไม่ — ใช้ตรวจลิงก์แผนที่ในฟอร์มแจ้งงาน
 *
 * ใช้สองวิธีร่วมกันแล้วยอมรับถ้า "วิธีใดวิธีหนึ่ง" ผ่าน เพราะแต่ละวิธีมีจุดบอดคนละแบบ
 * และการปฏิเสธงานจริงผิดๆ เสียหายกว่าการรับพิกัดที่คลาดไปเล็กน้อย:
 *
 * | วิธี | จุดบอด | ตัวอย่างที่พลาด |
 * |---|---|---|
 * | กรอบเขตจังหวัด | เกาะที่อยู่นอกรูปหลายเหลี่ยมของจังหวัด | เกาะเสม็ด (ระยอง) |
 * | ระยะถึงตัวเมือง | จังหวัดที่ตัวเมืองอยู่สุดขอบ | พัทยา จอมเทียน สัตหีบ (ชลบุรี) |
 *
 * ทั้งสองกรณีเป็นสถานที่จัดงานยอดนิยมของภาคตะวันออก ถ้าใช้วิธีเดียวจะปฏิเสธคนแจ้งงาน
 * ที่กรอกถูกทุกอย่าง ส่วนพิกัดที่ผิดจังหวัดจริงๆ (เช่นลิงก์เชียงใหม่ แต่เลือกชลบุรี)
 * จะไม่ผ่านทั้งสองวิธี จึงยังกันได้อยู่
 */
export function pointMatchesProvince(code: string, lat: number, lng: number): boolean {
  if (isPointInProvinceBounds(code, lat, lng)) return true;

  return findNearestProvince(lat, lng)?.code === code;
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
