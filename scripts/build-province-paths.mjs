/**
 * แปลง GeoJSON ขอบเขตจังหวัด → SVG path สำหรับหน้าแผนที่ (/map)
 *
 * รันด้วย: npm run build:map
 *
 * ทำไมต้องแปลงตอน build ไม่ทำตอนรัน:
 *  - ไม่ต้องส่งไลบรารี projection (เช่น d3-geo) ไปให้เบราว์เซอร์เลย
 *  - เบราว์เซอร์ได้ path string สำเร็จรูป วาดได้ทันที ไม่ต้องคำนวณ
 *  - server-render แผนที่ได้ ทำให้บอทและผู้ใช้ที่เน็ตช้าเห็นแผนที่ตั้งแต่ HTML แรก
 *
 * แหล่งข้อมูล: thailand-adm1-polygons-v1.0.0.geojson
 *   จาก DevelopedbyWill/thailand-canonical-admin-names (CC BY 4.0)
 *   อ้างอิงข้อมูลกรมแผนที่ทหารผ่าน OCHA Common Operational Datasets
 */

import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const SOURCE_URL =
  "https://raw.githubusercontent.com/DevelopedbyWill/thailand-canonical-admin-names/main/data/v1.0.0/thailand-adm1-polygons-v1.0.0.geojson";
const CACHE_PATH = resolve(ROOT, ".cache/thailand-adm1.geojson");
const OUTPUT_PATH = resolve(ROOT, "src/lib/data/province-paths.ts");

/** ความกว้างของ viewBox — ความสูงคำนวณตามสัดส่วนจริงของประเทศ */
const MAP_WIDTH = 600;

/**
 * ปัดพิกัดเหลือทศนิยม 1 ตำแหน่ง
 *
 * ที่ความกว้าง 600 หน่วย ทศนิยม 1 ตำแหน่งละเอียดกว่าที่ตาเห็นบนจอมาก
 * แต่ลดขนาดไฟล์ได้เกินครึ่ง
 */
const PRECISION = 1;

async function loadGeoJson() {
  if (existsSync(CACHE_PATH)) {
    console.log(`ใช้ไฟล์ที่ดาวน์โหลดไว้แล้ว: ${CACHE_PATH}`);
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  }

  console.log(`ดาวน์โหลดจาก ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(
      `ดาวน์โหลดไม่สำเร็จ (HTTP ${response.status}) — ` +
        `ดาวน์โหลดไฟล์เองแล้ววางไว้ที่ ${CACHE_PATH} จากนั้นรันสคริปต์ใหม่`,
    );
  }

  const text = await response.text();
  mkdirSync(dirname(CACHE_PATH), { recursive: true });
  writeFileSync(CACHE_PATH, text);
  return JSON.parse(text);
}

/**
 * Web Mercator projection
 *
 * ใช้สูตรเดียวกับที่ Google Maps / OpenStreetMap ใช้ ผลลัพธ์จึงเป็นรูปร่างประเทศไทย
 * ที่คนคุ้นตา (ต่างจากการเอา lat/lng มาวาดตรงๆ ซึ่งจะทำให้ประเทศดูแบนผิดสัดส่วน)
 */
function project(lng, lat) {
  const x = (lng + 180) / 360;
  const sinLat = Math.sin((lat * Math.PI) / 180);
  const y = 0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI);
  return [x, y];
}

/** GeoJSON เก็บ Polygon กับ MultiPolygon คนละรูปแบบ — ทำให้เป็นแบบเดียวกันก่อนใช้ */
function toPolygons(geometry) {
  return geometry.type === "MultiPolygon" ? geometry.coordinates : [geometry.coordinates];
}

// ---------------------------------------------------------------------------
// หาตำแหน่งวางชื่อจังหวัด
// ---------------------------------------------------------------------------

/** ระยะจากจุดถึงส่วนของเส้นตรง */
function distanceToSegment(px, py, ax, ay, bx, by) {
  let dx = bx - ax;
  let dy = by - ay;

  if (dx !== 0 || dy !== 0) {
    const t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
    if (t > 1) {
      ax = bx;
      ay = by;
    } else if (t > 0) {
      ax += dx * t;
      ay += dy * t;
    }
  }

  return Math.hypot(px - ax, py - ay);
}

/** ระยะจากจุดถึงขอบรูปหลายเหลี่ยม — เป็นบวกเมื่ออยู่ข้างใน เป็นลบเมื่ออยู่ข้างนอก */
function signedDistanceToPolygon(px, py, rings) {
  let inside = false;
  let minDistance = Infinity;

  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i];
      const [xj, yj] = ring[j];

      if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }

      minDistance = Math.min(minDistance, distanceToSegment(px, py, xi, yi, xj, yj));
    }
  }

  return (inside ? 1 : -1) * minDistance;
}

function ringArea(ring) {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] - ring[i][0]) * (ring[i][1] + ring[j][1]);
  }
  return Math.abs(sum / 2);
}

/**
 * หา "จุดที่อยู่ลึกที่สุดในรูปหลายเหลี่ยม" (pole of inaccessibility)
 *
 * ใช้แทนจุดกึ่งกลางกรอบสี่เหลี่ยม เพราะจังหวัดที่รูปร่างเบี้ยว เช่น ตาก ประจวบคีรีขันธ์
 * หนองคาย และสุพรรณบุรี มีจุดกึ่งกลางกรอบตกอยู่นอกตัวจังหวัดเลย ทำให้ชื่อไปโผล่ผิดที่
 *
 * วิธีการ: แบ่งพื้นที่เป็นตาราง วัดว่าแต่ละช่องอยู่ห่างจากขอบเท่าไร แล้วแบ่งย่อยเฉพาะช่อง
 * ที่ยังมีโอกาสดีกว่าคำตอบปัจจุบัน จนได้ความละเอียดที่พอใจ
 * เป็นอัลกอริทึมเดียวกับ polylabel ของ Mapbox
 */
function poleOfInaccessibility(rings, precision = 0.4) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const [x, y] of rings[0]) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const width = maxX - minX;
  const height = maxY - minY;
  const cellSize = Math.min(width, height);

  if (cellSize === 0) return [minX, minY];

  const makeCell = (x, y, half) => {
    const distance = signedDistanceToPolygon(x, y, rings);
    // ค่าดีที่สุดที่ช่องนี้ยังเป็นไปได้ = ระยะที่จุดกึ่งกลาง + ระยะถึงมุมช่อง
    return { x, y, half, distance, potential: distance + half * Math.SQRT2 };
  };

  const queue = [];
  let half = cellSize / 2;

  for (let x = minX; x < maxX; x += cellSize) {
    for (let y = minY; y < maxY; y += cellSize) {
      queue.push(makeCell(x + half, y + half, half));
    }
  }

  let best = makeCell(minX + width / 2, minY + height / 2, 0);

  while (queue.length > 0) {
    // หยิบช่องที่มีโอกาสดีที่สุด — สแกนหาแทนการ sort ทั้งคิวเพื่อไม่ให้ช้า
    let bestIndex = 0;
    for (let i = 1; i < queue.length; i += 1) {
      if (queue[i].potential > queue[bestIndex].potential) bestIndex = i;
    }

    const cell = queue.splice(bestIndex, 1)[0];

    if (cell.distance > best.distance) best = cell;
    if (cell.potential - best.distance <= precision) continue;

    half = cell.half / 2;
    queue.push(makeCell(cell.x - half, cell.y - half, half));
    queue.push(makeCell(cell.x + half, cell.y - half, half));
    queue.push(makeCell(cell.x - half, cell.y + half, half));
    queue.push(makeCell(cell.x + half, cell.y + half, half));
  }

  return [best.x, best.y];
}

async function main() {
  const geojson = await loadGeoJson();
  const features = geojson.features;
  console.log(`อ่านได้ ${features.length} จังหวัด`);

  // รอบแรก: หาขอบเขตของทั้งประเทศ เพื่อ normalize พิกัดให้พอดี viewBox
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const feature of features) {
    for (const polygon of toPolygons(feature.geometry)) {
      for (const ring of polygon) {
        for (const [lng, lat] of ring) {
          const [x, y] = project(lng, lat);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
  }

  const scale = MAP_WIDTH / (maxX - minX);
  const mapHeight = Math.ceil((maxY - minY) * scale);

  const toSvg = (lng, lat) => {
    const [x, y] = project(lng, lat);
    return [
      Number(((x - minX) * scale).toFixed(PRECISION)),
      Number(((y - minY) * scale).toFixed(PRECISION)),
    ];
  };

  // รอบสอง: สร้าง path string, bounding box และตำแหน่งวางชื่อ ต่อจังหวัด
  const paths = {};
  const bboxes = {};
  const anchors = {};

  for (const feature of features) {
    // GeoJSON ใช้ 'TH37' ส่วนตาราง provinces ของเราใช้ ISO 3166-2 'TH-37'
    const code = feature.properties.ADM1_PCODE.replace(/^TH/, "TH-");

    // วางชื่อบนผืนแผ่นดินที่ใหญ่ที่สุดของจังหวัด — จังหวัดที่มีเกาะ เช่น ภูเก็ต ตราด
    // ถ้าคิดรวมทุกเกาะ ชื่ออาจไปตกกลางทะเลระหว่างเกาะ
    const projectedPolygons = toPolygons(feature.geometry).map((polygon) =>
      polygon.map((ring) => ring.map(([lng, lat]) => toSvg(lng, lat))),
    );

    const largestPolygon = projectedPolygons.reduce((largest, polygon) =>
      ringArea(polygon[0]) > ringArea(largest[0]) ? polygon : largest,
    );

    const [anchorX, anchorY] = poleOfInaccessibility(largestPolygon);
    anchors[code] = [
      Number(anchorX.toFixed(PRECISION)),
      Number(anchorY.toFixed(PRECISION)),
    ];

    const commands = [];
    let pMinX = Infinity;
    let pMinY = Infinity;
    let pMaxX = -Infinity;
    let pMaxY = -Infinity;

    for (const polygon of toPolygons(feature.geometry)) {
      for (const ring of polygon) {
        let previous = null;

        for (let i = 0; i < ring.length; i += 1) {
          const [x, y] = toSvg(ring[i][0], ring[i][1]);

          if (x < pMinX) pMinX = x;
          if (x > pMaxX) pMaxX = x;
          if (y < pMinY) pMinY = y;
          if (y > pMaxY) pMaxY = y;

          // ข้ามจุดที่ปัดเศษแล้วซ้ำกับจุดก่อนหน้า — ไม่เปลี่ยนรูปร่างแต่ลดขนาดไฟล์
          if (previous && previous[0] === x && previous[1] === y) continue;

          commands.push(`${commands.length === 0 || previous === null ? "M" : "L"}${x} ${y}`);
          previous = [x, y];
        }

        commands.push("Z");
        previous = null;
      }
    }

    paths[code] = commands.join("");
    bboxes[code] = [
      Number(pMinX.toFixed(PRECISION)),
      Number(pMinY.toFixed(PRECISION)),
      Number((pMaxX - pMinX).toFixed(PRECISION)),
      Number((pMaxY - pMinY).toFixed(PRECISION)),
    ];
  }

  const sortedCodes = Object.keys(paths).sort();

  const output = `// ⚠️ ไฟล์นี้ generate อัตโนมัติ — ห้ามแก้ด้วยมือ
// สร้างใหม่ด้วย: npm run build:map  (สคริปต์อยู่ที่ scripts/build-province-paths.mjs)
//
// ข้อมูลขอบเขตจังหวัดจาก Thailand Canonical Admin Names โดย DevelopedbyWill (CC BY 4.0)
// อ้างอิงข้อมูลกรมแผนที่ทหารผ่าน OCHA Common Operational Datasets
// https://github.com/DevelopedbyWill/thailand-canonical-admin-names

/** viewBox ของแผนที่ทั้งประเทศ */
export const MAP_VIEWBOX = "0 0 ${MAP_WIDTH} ${mapHeight}";
export const MAP_WIDTH = ${MAP_WIDTH};
export const MAP_HEIGHT = ${mapHeight};

/**
 * ค่าคงที่ของ Web Mercator ที่ใช้ตอนแปลงขอบเขตจังหวัดเป็น SVG
 *
 * ต้อง export ออกมาเพราะการปักหมุดงานต้องแปลง lat/lng ตอนรัน (runtime)
 * ด้วยสูตรและค่าคงที่ชุดเดียวกันเป๊ะ ไม่งั้นหมุดจะไม่ตรงกับรูปร่างจังหวัด
 * ใช้คู่กับ projectToMap() ใน src/lib/map-camera.ts
 */
export const MAP_PROJECTION = {
  minX: ${minX},
  minY: ${minY},
  scale: ${scale},
} as const;

/** รหัส ISO 3166-2 (เช่น 'TH-50') → SVG path — ตรงกับฟิลด์ code ใน provinces.ts */
export const PROVINCE_PATHS: Record<string, string> = {
${sortedCodes.map((code) => `  "${code}": "${paths[code]}",`).join("\n")}
};

/** รหัสจังหวัด → [x, y, width, height] ใช้คำนวณปลายทางของการซูม */
export const PROVINCE_BBOXES: Record<string, [number, number, number, number]> = {
${sortedCodes.map((code) => `  "${code}": [${bboxes[code].join(", ")}],`).join("\n")}
};

/**
 * รหัสจังหวัด → [x, y] จุดวางชื่อจังหวัดบนแผนที่
 *
 * เป็นจุดที่อยู่ลึกที่สุดในตัวจังหวัด (pole of inaccessibility) ไม่ใช่จุดกึ่งกลางกรอบ
 * จึงรับประกันว่าอยู่ในเขตจังหวัดจริงเสมอ และอยู่ในส่วนที่กว้างที่สุดด้วย
 *
 * ถ้าจังหวัดไหนยังวางไม่สวย ปรับได้ที่ src/lib/data/province-label-offsets.ts
 * (อย่าแก้ไฟล์นี้ เพราะจะถูกเขียนทับเมื่อ generate ใหม่)
 */
export const PROVINCE_LABEL_ANCHORS: Record<string, [number, number]> = {
${sortedCodes.map((code) => `  "${code}": [${anchors[code].join(", ")}],`).join("\n")}
};
`;

  writeFileSync(OUTPUT_PATH, output);

  const sizeKb = (Buffer.byteLength(output) / 1024).toFixed(1);
  console.log(`เขียน ${OUTPUT_PATH}`);
  console.log(`  viewBox: 0 0 ${MAP_WIDTH} ${mapHeight}`);
  console.log(`  จังหวัด: ${sortedCodes.length}`);
  console.log(`  ขนาดไฟล์: ${sizeKb} KB`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
