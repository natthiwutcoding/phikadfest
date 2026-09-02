import { describe, expect, it } from "vitest";

import { clusterPins, clusterSpreadHeight, willSplit, type PinPoint } from "@/lib/map-cluster";
import type { MapPinEvent } from "@/lib/types";

/**
 * การจัดกลุ่มหมุดเป็นตรรกะที่ตรวจด้วยตาได้ยากมาก — บนจอเห็นแค่ "วงกลมกับตัวเลข"
 * ผิดหรือถูกดูไม่ออกจนกว่าจะนับหมุดจริงเทียบทีละตัว เทสต์จึงคุ้มที่สุดตรงนี้
 */

function pin(x: number, y: number, id = `${x}:${y}`): PinPoint {
  return {
    event: { id, slug: id, title: id } as MapPinEvent,
    point: { x, y },
  };
}

/** จำนวนสมาชิกของแต่ละกลุ่ม เรียงจากมากไปน้อย — ใช้เทียบผลโดยไม่ผูกกับลำดับหรือ id */
function memberCounts(pins: PinPoint[], cellSize: number): number[] {
  return clusterPins(pins, cellSize)
    .map((cluster) => cluster.members.length)
    .sort((a, b) => b - a);
}

describe("clusterPins", () => {
  it("หมุดที่ตกช่องเดียวกันรวมเป็นกลุ่มเดียว", () => {
    const clusters = clusterPins([pin(10, 10), pin(12, 11), pin(11, 13)], 10);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].members).toHaveLength(3);
  });

  it("จุดกึ่งกลางกลุ่มคือค่าเฉลี่ยของสมาชิก", () => {
    const [cluster] = clusterPins([pin(10, 20), pin(14, 24)], 10);

    expect(cluster.x).toBeCloseTo(12);
    expect(cluster.y).toBeCloseTo(22);
  });

  it("หมุดที่อยู่ไกลกันไม่ถูกยุบรวม", () => {
    expect(memberCounts([pin(10, 10), pin(500, 500)], 10)).toEqual([1, 1]);
  });

  it("ทุกหมุดต้องถูกนับ ไม่มีหายระหว่างการยุบกลุ่ม", () => {
    const pins = [pin(10, 10), pin(12, 12), pin(48, 10), pin(300, 300), pin(305, 302)];
    const total = clusterPins(pins, 20).reduce((sum, c) => sum + c.members.length, 0);

    expect(total).toBe(pins.length);
  });

  it("id ของกลุ่มไม่ขึ้นกับลำดับข้อมูลที่ส่งเข้ามา", () => {
    const pins = [pin(10, 10), pin(60, 60), pin(12, 12)];
    const forward = clusterPins(pins, 20).map((c) => c.id).sort();
    const reversed = clusterPins([...pins].reverse(), 20).map((c) => c.id).sort();

    expect(forward).toEqual(reversed);
  });

  it("ขนาดช่องเป็นศูนย์ (ตอน viewport ยังวัดไม่ได้) ไม่ทำให้พัง", () => {
    const clusters = clusterPins([pin(10, 10), pin(11, 11)], 0);

    expect(clusters).toHaveLength(2);
    expect(clusters.every((c) => c.members.length === 1)).toBe(true);
  });

  it("ซูมเข้า (ช่องเล็กลง) ทำให้กลุ่มคลายตัวเอง", () => {
    const pins = [pin(10, 10), pin(30, 30)];

    expect(memberCounts(pins, 50)).toEqual([2]);
    expect(memberCounts(pins, 5)).toEqual([1, 1]);
  });
});

describe("mergeAdjacent (ผ่าน clusterPins)", () => {
  it("กลุ่มเล็กที่อยู่ชิดกลุ่มใหญ่คนละช่องถูกยุบเข้าด้วยกัน", () => {
    // สามหมุดในช่อง (0,0) กับหมุดเดี่ยวที่อยู่อีกฝั่งของเส้นตาราง แต่ห่างกันจริงแค่ ~3 หน่วย
    const pins = [pin(17, 5), pin(18, 6), pin(19, 7), pin(21, 6)];

    expect(memberCounts(pins, 20)).toEqual([4]);
  });

  it("ไม่ยุบต่อกันเป็นทอดๆ ตามแนวยาว (single-link chaining)", () => {
    /*
      หมุดเรียงเป็นแถวยาวห่างกันช่องละหนึ่ง — ถ้าปล่อยให้ยุบต่อกันได้หลายชั้น
      งานตลอดแนวถนนคนเดินจะถูกดูดเป็นก้อนเดียวทั้งเส้น ซึ่งแย่กว่าปัญหาเดิม
      กติกา "ยุบได้ชั้นเดียว" จึงต้องเหลือมากกว่าหนึ่งกลุ่มเสมอ
    */
    const pins = [pin(5, 5), pin(25, 5), pin(45, 5), pin(65, 5), pin(85, 5)];

    expect(clusterPins(pins, 20).length).toBeGreaterThan(1);
  });
});

describe("clusterSpreadHeight", () => {
  const aspect = 1;

  it("หมุดเดี่ยวไม่มีการกระจายให้ซูมหา", () => {
    const [cluster] = clusterPins([pin(10, 10)], 20);

    expect(clusterSpreadHeight(cluster, aspect)).toBeNull();
  });

  it("สมาชิกอยู่จุดเดียวกันเป๊ะ ซูมเท่าไรก็ไม่แยก", () => {
    const [cluster] = clusterPins([pin(10, 10, "a"), pin(10, 10, "b")], 20);

    expect(clusterSpreadHeight(cluster, aspect)).toBeNull();
  });

  it("กลุ่มที่เรียงแนวนอนต้องเผื่อความสูงตามสัดส่วนจอ ไม่งั้นซูมแล้วล้นออกนอกจอ", () => {
    const [cluster] = clusterPins([pin(0, 10), pin(18, 10)], 20);

    // จอกว้างเป็นสองเท่าของความสูง — ความกว้าง 18 หน่วยต้องแปลงเป็นความสูงที่ต้องการ
    const wide = clusterSpreadHeight(cluster, 2)!;
    const square = clusterSpreadHeight(cluster, 1)!;

    expect(wide).toBeGreaterThan(0);
    expect(square).toBeGreaterThan(wide);
  });
});

describe("willSplit", () => {
  it("กลุ่มที่สมาชิกห่างกันจะแตกเมื่อช่องเล็กลง", () => {
    const [cluster] = clusterPins([pin(10, 10), pin(30, 30)], 50);

    expect(willSplit(cluster, 5)).toBe(true);
  });

  it("งานในลานเดียวกันซูมยังไงก็ไม่แตก — ต้องเปิดรายการให้เลือกแทน", () => {
    const [cluster] = clusterPins([pin(10, 10, "a"), pin(10, 10, "b")], 50);

    expect(willSplit(cluster, 0.01)).toBe(false);
  });
});
