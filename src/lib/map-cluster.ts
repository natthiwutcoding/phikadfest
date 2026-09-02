import type { MapPinEvent } from "@/lib/types";

/**
 * จัดกลุ่มหมุดที่อยู่ใกล้กันบนจอ
 *
 * ── ทำไมต้องมี ──
 * งานหลายรายการในเมืองเดียวกันมีพิกัดห่างกันไม่กี่ร้อยเมตร พอวาดบนแผนที่ระดับจังหวัด
 * หมุดจะทับกันจนนับไม่ได้ว่ามีกี่งาน (วัดจริงจากข้อมูลทดสอบในเชียงใหม่ พบว่าหมุดกระจายกัน
 * แค่ 5.8 หน่วยแผนที่ ขณะที่หมุดเดียวมีเส้นผ่านศูนย์กลาง 6.4 หน่วย — ทับกันเกือบสนิท)
 *
 * ── วิธีที่ใช้ ──
 * แบ่งพื้นที่เป็นตารางแล้วรวมหมุดที่ตกช่องเดียวกัน (grid clustering)
 * แล้วตามด้วยการยุบกลุ่มที่ตกคนละช่องแต่จริงๆ ชิดกันบนจอ (ดู mergeAdjacent)
 *
 * เลือกวิธีนี้แทนอัลกอริทึมจัดกลุ่มที่ซับซ้อนกว่า เพราะ:
 *   - เร็ว O(n) ไม่ต้องเทียบทุกคู่
 *   - ผลลัพธ์นิ่ง กลุ่มไม่กระโดดไปมา เพราะเส้นตารางอิงพิกัดแผนที่ ไม่ได้อิงลำดับข้อมูล
 *     หรือตำแหน่งกล้อง
 *   - โค้ดสั้นพอที่คนเดียวจะดูแลไหว
 *
 * ผู้เรียกคำนวณขนาดช่องจาก "กี่พิกเซลบนจอ" กลับเป็นหน่วยแผนที่ กลุ่มจึงคลายตัวเอง
 * อัตโนมัติเมื่อซูมเข้า โดยไม่ต้องมีตารางแยกต่อระดับซูม
 */

export interface PinPoint {
  event: MapPinEvent;
  point: { x: number; y: number };
}

export interface PinCluster {
  /** id คงที่ตามตำแหน่งช่อง ทำให้ React ไม่สร้าง element ใหม่ตอนผู้ใช้เลื่อนแผนที่ */
  id: string;
  /** ช่องตารางที่กลุ่มนี้ยึดเป็นหลัก ใช้หากลุ่มข้างเคียงตอนยุบรวม */
  col: number;
  row: number;
  /** จุดกึ่งกลางของกลุ่ม (ค่าเฉลี่ยของสมาชิก) */
  x: number;
  y: number;
  members: PinPoint[];
}

/** เผื่อขอบตอนซูมเข้าหากลุ่ม — 1 คือชิดพอดี มากกว่านั้นเห็นบริเวณรอบๆ ด้วย */
const CLUSTER_ZOOM_PADDING = 2.5;

function buildCluster(col: number, row: number, members: PinPoint[]): PinCluster {
  const sumX = members.reduce((total, pin) => total + pin.point.x, 0);
  const sumY = members.reduce((total, pin) => total + pin.point.y, 0);

  return {
    // ใช้ตำแหน่งช่องเป็น id เพื่อให้กลุ่มเดิมได้ id เดิมทุกครั้งที่ re-render
    id: `cell-${col}:${row}`,
    col,
    row,
    x: sumX / members.length,
    y: sumY / members.length,
    members,
  };
}

/**
 * กลุ่ม a "ใหญ่กว่า" กลุ่ม b หรือไม่ — ใช้ตัดสินว่าใครควรยุบเข้าหาใคร
 *
 * เทียบจำนวนสมาชิกก่อน ถ้าเท่ากันใช้ id ตัดสิน จุดสำคัญคือกติกานี้เป็นลำดับที่แน่นอน
 * (strict total order) จึงยุบวนกลับมาหากันเองไม่ได้
 */
function isLarger(a: PinCluster, b: PinCluster): boolean {
  if (a.members.length !== b.members.length) return a.members.length > b.members.length;
  return a.id < b.id;
}

/**
 * รวมหมุดที่ตกช่องตารางเดียวกัน
 *
 * @param cellSize ขนาดช่องในหน่วยแผนที่ — ผู้เรียกแปลงมาจากพิกเซลบนจอแล้ว
 */
export function clusterPins(pins: PinPoint[], cellSize: number): PinCluster[] {
  // ป้องกันการหารด้วยศูนย์ตอน viewport ยังวัดไม่ได้ — คืนหมุดเดี่ยวไปตามเดิม
  if (!(cellSize > 0)) {
    return pins.map((pin, index) => buildCluster(index, 0, [pin]));
  }

  const cells = new Map<string, PinPoint[]>();

  for (const pin of pins) {
    const key = `${Math.floor(pin.point.x / cellSize)}:${Math.floor(pin.point.y / cellSize)}`;

    const existing = cells.get(key);
    if (existing) existing.push(pin);
    else cells.set(key, [pin]);
  }

  const clusters = [...cells.entries()].map(([key, members]) => {
    const [col, row] = key.split(":").map(Number);
    return buildCluster(col, row, members);
  });

  return mergeAdjacent(clusters, cellSize);
}

/**
 * ยุบกลุ่มที่ตกคนละช่องแต่จริงๆ อยู่ชิดกันบนจอ
 *
 * ── ปัญหาที่แก้ ──
 * จุดอ่อนของการแบ่งด้วยตารางคือเส้นตารางอาจผ่ากลางหมุดสองอันที่อยู่ชิดกันมาก
 * ตอนทดสอบเจอหมุดเดี่ยวห่างจากวงกลุ่มแค่ 23px ทั้งที่ช่องกว้าง 44px — หมุดไปเบียด
 * ติดขอบวงกลุ่มจนดูเหมือนวาดผิด ทั้งที่อัลกอริทึมทำงานถูกต้องตามที่เขียนไว้
 *
 * ── กติกา ──
 * กลุ่มเล็กยุบเข้ากลุ่มที่ใหญ่กว่าในช่องข้างเคียง ถ้าจุดกึ่งกลางห่างกันไม่เกินหนึ่งช่อง
 *
 * ⚠️ ยุบได้ชั้นเดียวเท่านั้น — ถ้าเป้าหมายเองก็กำลังจะยุบไปที่อื่น ให้อยู่เฉยๆ
 * กติกาข้อนี้ห้ามตัดออก เพราะถ้าปล่อยให้ยุบต่อกันเป็นทอดๆ งานที่เรียงตามถนนยาวๆ
 * (เช่นงานตลอดแนวถนนคนเดิน) จะถูกดูดรวมเป็นก้อนเดียวทั้งเส้น ซึ่งแย่กว่าปัญหาเดิม
 * — เป็นข้อเสียที่รู้จักกันในชื่อ single-link chaining
 */
function mergeAdjacent(clusters: PinCluster[], cellSize: number): PinCluster[] {
  if (clusters.length < 2) return clusters;

  const grid = new Map(clusters.map((cluster) => [`${cluster.col}:${cluster.row}`, cluster]));

  /** กลุ่มไหนอยากยุบไปรวมกับใคร — คิดจากผังเดิมทั้งหมดก่อน ยังไม่ลงมือย้าย */
  const wants = new Map<string, PinCluster>();

  for (const cluster of clusters) {
    let best: PinCluster | null = null;
    let bestDistance = cellSize;

    for (let dc = -1; dc <= 1; dc += 1) {
      for (let dr = -1; dr <= 1; dr += 1) {
        if (dc === 0 && dr === 0) continue;

        const other = grid.get(`${cluster.col + dc}:${cluster.row + dr}`);
        if (!other || !isLarger(other, cluster)) continue;

        const distance = Math.hypot(other.x - cluster.x, other.y - cluster.y);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = other;
        }
      }
    }

    if (best) wants.set(cluster.id, best);
  }

  if (wants.size === 0) return clusters;

  /** สมาชิกที่ลงเอยในแต่ละกลุ่มหลังยุบ */
  const absorbed = new Map<string, PinPoint[]>();

  for (const cluster of clusters) {
    const target = wants.get(cluster.id);
    // เป้าหมายเองกำลังจะย้าย — กลุ่มนี้อยู่ที่เดิม (กันการยุบต่อกันเป็นทอดๆ)
    const into = target && !wants.has(target.id) ? target : cluster;

    const bucket = absorbed.get(into.id);
    if (bucket) bucket.push(...cluster.members);
    else absorbed.set(into.id, [...cluster.members]);
  }

  return clusters.flatMap((cluster) => {
    const members = absorbed.get(cluster.id);
    return members ? [buildCluster(cluster.col, cluster.row, members)] : [];
  });
}

/**
 * ระดับซูมที่พอดีกับขอบเขตของสมาชิกในกลุ่ม — ใช้ตอนกดกลุ่มเพื่อซูมเข้าไปดู
 *
 * ต้องคิดทั้งสองแกนแล้วเลือกอันที่กว้างกว่า เหมือนที่ cameraFitProvince ทำ
 * เพราะกรอบจอมักไม่ได้เป็นสี่เหลี่ยมจัตุรัส ถ้าคิดแต่แกนตั้ง กลุ่มที่เรียงกันแนวนอน
 * จะถูกซูมจนล้นออกนอกจอ
 *
 * คืน null เมื่อสมาชิกทุกตัวอยู่จุดเดียวกันเป๊ะ — ซูมเท่าไรก็ไม่แยกจากกัน
 */
export function clusterSpreadHeight(cluster: PinCluster, aspect: number): number | null {
  if (cluster.members.length < 2) return null;

  const xs = cluster.members.map((pin) => pin.point.x);
  const ys = cluster.members.map((pin) => pin.point.y);

  const spreadX = Math.max(...xs) - Math.min(...xs);
  const spreadY = Math.max(...ys) - Math.min(...ys);

  if (spreadX < 0.001 && spreadY < 0.001) return null;

  const safeAspect = aspect > 0 ? aspect : 1;

  return Math.max(
    spreadY * CLUSTER_ZOOM_PADDING,
    (spreadX * CLUSTER_ZOOM_PADDING) / safeAspect,
  );
}

/**
 * ถ้าจัดกลุ่มใหม่ด้วยช่องขนาดนี้ กลุ่มนี้จะแตกออกเป็นหลายกลุ่มไหม
 *
 * ใช้ตัดสินใจตอนกดกลุ่มว่าจะ "ซูมเข้าไปดู" หรือ "เปิดรายการให้เลือก"
 * จำเป็นเพราะเพดานซูม (MIN_VISIBLE_HEIGHT) ทำให้บางกลุ่มซูมยังไงก็ไม่แยก
 * เช่นงานสามรายการในลานเดียวกัน — ถ้าซูมแล้วไม่แตก ผู้ใช้จะกดแล้วรู้สึกว่าเสียเที่ยว
 */
export function willSplit(cluster: PinCluster, cellSize: number): boolean {
  return clusterPins(cluster.members, cellSize).length > 1;
}
