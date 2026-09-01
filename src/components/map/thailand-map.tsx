"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";

import {
  HIDDEN_PROVINCE_LABELS,
  PROVINCE_LABEL_OFFSETS,
} from "@/lib/data/province-label-offsets";
import { ClusterPinCard } from "@/components/map/cluster-pin-card";
import { EventPinCard } from "@/components/map/event-pin-card";
import { PROVINCES } from "@/lib/data/provinces";
import {
  ACTIVE_PROVINCE_CODES,
  ACTIVE_REGION_LABEL,
  isProvinceInScope,
} from "@/lib/region-scope";
import { MAP_VIEWBOX, PROVINCE_LABEL_ANCHORS, PROVINCE_PATHS } from "@/lib/data/province-paths";
import type { MapPinEvent, ProvinceEventSummary } from "@/lib/events";
import {
  cameraFitProvince,
  cameraFitProvinces,
  cameraOnPoint,
  cameraOnProvince,
  cameraWholeCountry,
  clampCamera,
  findNearestProvince,
  mapToScreen,
  pixelsToMapUnits,
  projectToMap,
  toTransform,
  visibleBounds,
  ZOOM_STEP,
  zoomAt,
  zoomBy,
  type Camera,
  type Viewport,
} from "@/lib/map-camera";
import {
  clusterPins,
  clusterSpreadHeight,
  willSplit,
  type PinCluster,
} from "@/lib/map-cluster";

/** จำจังหวัดของผู้ใช้ไว้ ครั้งหน้าจะได้เปิดมาที่เดิมโดยไม่ต้องรอขอตำแหน่งใหม่ */
const HOME_PROVINCE_KEY = "phikadfest:home-province";

/** ขยับเกินระยะนี้ถือว่าลาก ไม่ใช่กดเลือกจังหวัด */
const DRAG_THRESHOLD_PX = 5;


/** ซูมออกกว่านี้ไม่ต้องแสดงชื่อจังหวัด เพราะตัวหนังสือจะทับกันจนอ่านไม่ออก */
const LABEL_VISIBLE_HEIGHT_LIMIT = 620;

/** ขนาดตัวอักษรชื่อจังหวัดที่ต้องการให้เห็นบนจอ (พิกเซล) */
const LABEL_FONT_PX = 12;

/** ซูมออกกว่านี้ไม่ต้องปักหมุด เพราะหมุดจะทับกันจนดูไม่รู้เรื่อง */
const PIN_VISIBLE_HEIGHT_LIMIT = 620;

/** รัศมีหมุดที่ต้องการให้เห็นบนจอ (พิกเซล) */
const PIN_RADIUS_PX = 7;

/**
 * มีงานกี่รายการถึงจะได้สีเข้มสุด
 *
 * ใช้ค่าคงที่แทนการเทียบกับจังหวัดที่เยอะสุด เพื่อให้สีสื่อความหมายเดิมเสมอ
 * ไม่ว่าจะมีข้อมูลในระบบมากหรือน้อย — 3 งานควรดูเหมือน 3 งานทุกวัน
 */
const DENSITY_FULL_AT = 10;

/**
 * ขนาดช่องตารางจัดกลุ่มหมุด หน่วยพิกเซลบนจอ
 *
 * ตั้ง 44 ให้เท่าขนาดเป้าแตะขั้นต่ำตามมาตรฐาน — หมุดที่อยู่ใกล้กันกว่านี้
 * กดแยกกันด้วยนิ้วไม่ได้อยู่ดี จึงควรถูกยุบเป็นกลุ่มเดียวตั้งแต่แรก
 *
 * คิดเป็นพิกเซลไม่ใช่หน่วยแผนที่ เพราะเกณฑ์ที่แท้จริงคือ "ตาแยกออกไหม บนจอ"
 * ซึ่งไม่ขึ้นกับระดับซูม — และทำให้กลุ่มคลายตัวเองเมื่อซูมเข้าโดยอัตโนมัติ
 */
const CLUSTER_CELL_PX = 44;

/** รัศมีวงกลุ่มบนจอ — โตตามจำนวนสมาชิกแต่มีเพดาน ไม่งั้นกลุ่มใหญ่จะบังแผนที่ */
const CLUSTER_MIN_RADIUS_PX = 13;
const CLUSTER_MAX_RADIUS_PX = 22;

/** ขนาดตัวเลขบอกจำนวนงานในวงกลุ่ม */
const CLUSTER_COUNT_FONT_PX = 12;

/** ซูมเข้ากว่านี้ค่อยแสดงชื่องานข้างหมุด — ซูมออกกว่านี้ตัวหนังสือจะทับกัน */
const PIN_TITLE_VISIBLE_HEIGHT = 400;

/**
 * มีจุดในกรอบมากกว่านี้ไม่ต้องแสดงชื่อ
 *
 * ความหนาแน่นของป้ายต้องปรับตามจำนวนจุด ไม่งั้นพอมีงานเยอะๆ ในเมืองเดียวกัน
 * ป้ายจะพาดทับกันจนอ่านไม่ออกสักอัน — สู้ปล่อยให้เป็นจุดเปล่าแล้วกดดูทีละอันดีกว่า
 */
const PIN_TITLE_MAX_COUNT = 6;

/** ขนาดตัวอักษรชื่องานที่ต้องการให้เห็นบนจอ (พิกเซล) */
const PIN_TITLE_FONT_PX = 11;

/** ชื่องานยาวกว่านี้ตัดทิ้ง — ภาษาไทยกินความกว้างมากกว่าอังกฤษต่อตัวอักษร */
const PIN_TITLE_MAX_CHARS = 16;

/** รัศมีจุดตำแหน่งผู้ใช้บนจอ (พิกเซล) — เล็กกว่าหมุดงานเล็กน้อย เพราะไม่ใช่เนื้อหาหลักของแผนที่ */
const USER_LOCATION_RADIUS_PX = 6;

/**
 * ระยะจริงต่อหนึ่งหน่วยแผนที่ (เมตร) — ใช้แปลงค่าความคลาดเคลื่อนจากเบราว์เซอร์เป็นขนาดวงบนแผนที่
 *
 * มาจากสเกลของ MAP_PROJECTION: 1 หน่วย = 360/26110.97 องศาลองจิจูด ซึ่งที่ละติจูดราว 13.5°
 * (กลางภาคตะวันออก) เท่ากับประมาณ 1.49 กม. เป็นค่าประมาณที่พอสำหรับวาดวงบอกความคลาดเคลื่อน
 * ไม่ได้ใช้คำนวณระยะทางจริง — งานนั้นเป็นหน้าที่ของ PostGIS ที่ฝั่งฐานข้อมูล
 */
const METERS_PER_MAP_UNIT = 1_490;

/** ระดับซูมตอนกดปุ่มไปที่ตำแหน่งของฉัน — ราว 45 กม. พอเห็นตัวเองกับงานรอบๆ พร้อมกัน */
const USER_LOCATION_VISIBLE_HEIGHT = 30;

/** ล้อเมาส์หนึ่งครั้งซูมทีละเท่านี้ — น้อยกว่าปุ่ม + / − เพื่อให้ปรับละเอียดได้ */
const WHEEL_ZOOM_STEP = 1.18;

/**
 * ขนาดกรอบสมมติก่อนวัดของจริง
 *
 * จำเป็นเพราะฝั่งเซิร์ฟเวอร์ไม่มี DOM ให้วัด ใช้แค่เฟรมแรกก่อน useLayoutEffect
 * จะวัดขนาดจริงแล้วแทนที่ (layout effect ทำงานก่อนเบราว์เซอร์วาด จึงไม่เห็นภาพกระตุก)
 */
const FALLBACK_VIEWPORT: Viewport = { width: 390, height: 700 };

/** ความเร็วของอนิเมชั่นซูม — ล้อเมาส์ต้องไวกว่า ไม่งั้นหมุนรัวแล้วจะรู้สึกหน่วง */
type ZoomFeel = "smooth" | "quick" | "none";

interface Props {
  summary: ProvinceEventSummary[];
  /** งานที่มีพิกัดจริง สำหรับปักหมุด */
  pinEvents: MapPinEvent[];
  /** ISO code ของจังหวัดที่เลือกอยู่ มาจาก URL (เซิร์ฟเวอร์เป็นคนบอก) */
  selectedCode?: string;
  /** query string ปัจจุบัน (range) ที่ต้องพาไปด้วยตอนเปลี่ยนจังหวัด */
  baseParams: string;
}

function readStoredProvinceCode(): string | null {
  try {
    return localStorage.getItem(HOME_PROVINCE_KEY);
  } catch {
    // โหมดส่วนตัวของบางเบราว์เซอร์ห้ามอ่าน localStorage — ไม่ใช่เรื่องคอขาดบาดตาย
    return null;
  }
}

function rememberProvince(code: string) {
  try {
    localStorage.setItem(HOME_PROVINCE_KEY, code);
  } catch {
    // เขียนไม่ได้ก็แค่ครั้งหน้าต้องขอตำแหน่งใหม่
  }
}


/** มุมมองทั้งภาคที่เปิดรับงาน — มุมมอง "ถอยสุด" ของเว็บนี้ แทนที่มุมมองทั้งประเทศ */
function regionCamera(viewport: Viewport): Camera {
  return cameraFitProvinces(ACTIVE_PROVINCE_CODES, viewport) ?? cameraWholeCountry();
}

/**
 * กล้องตั้งต้น เรียกครั้งเดียวตอน mount
 *
 * ⚠️ ห้ามอ่าน localStorage ที่นี่เด็ดขาด
 * เซิร์ฟเวอร์อ่าน localStorage ไม่ได้ จึงได้มุมมองทั้งภาค ส่วนเบราว์เซอร์อ่านได้จึงได้
 * จังหวัดที่จำไว้ — ป้ายชื่อจังหวัดที่วาดออกมาจึงไม่ตรงกันและเกิด hydration error
 * (React จะทิ้งผลจากเซิร์ฟเวอร์แล้ววาดใหม่ทั้งก้อน ทำให้ภาพกระตุกตอนเปิดหน้า)
 *
 * จังหวัดที่จำไว้ถูกนำมาใช้ใน useEffect หลัง mount แทน ซึ่งเป็นที่ที่ถูกต้องสำหรับ
 * ข้อมูลที่มีเฉพาะฝั่งเบราว์เซอร์
 */
function initialCamera(selectedCode: string | undefined): Camera {
  // มาจากลิงก์ที่ระบุจังหวัดอยู่แล้ว (เช่นแชร์ลิงก์มา) ให้ซูมไปจังหวัดนั้นเลย
  // ค่านี้มาจาก URL ซึ่งเซิร์ฟเวอร์กับเบราว์เซอร์เห็นตรงกัน จึงใช้ตอน render แรกได้
  if (selectedCode) {
    const fitted = cameraFitProvince(selectedCode, FALLBACK_VIEWPORT);
    if (fitted) return fitted;
  }

  return regionCamera(FALLBACK_VIEWPORT);
}

export function ThailandMap({ summary, pinEvents, selectedCode, baseParams }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const svgRef = useRef<SVGSVGElement>(null);
  const [camera, setCamera] = useState<Camera>(() => initialCamera(selectedCode));
  const [viewport, setViewport] = useState<Viewport>(FALLBACK_VIEWPORT);
  const [zoomFeel, setZoomFeel] = useState<ZoomFeel>("smooth");

  /**
   * ตำแหน่งผู้ใช้ที่ได้รับอนุญาตแล้ว — null คือยังไม่รู้ (ยังไม่ขอ ปฏิเสธ หรือหาไม่เจอ)
   *
   * เก็บพิกัดดิบไว้ ไม่ใช่แค่ชื่อจังหวัดเหมือนเดิม เพราะต้องใช้ปักหมุดตรงจุดที่ยืนอยู่จริง
   * accuracy คือรัศมีความคลาดเคลื่อนหน่วยเมตรที่เบราว์เซอร์แจ้งมา ใช้วาดวงความแม่นยำ
   */
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
    accuracy: number;
    /** อยู่ในภาคที่เปิดรับงานไหม — ใช้ตัดสินว่าจะพากล้องไปหาหรือแค่บอกว่าอยู่นอกพื้นที่ */
    inScope: boolean;
  } | null>(null);

  /** ข้อความแจ้งเตือนสั้นๆ เหนือปุ่มควบคุม เช่น ตอนผู้ใช้อยู่นอกภาคที่เปิดรับงาน */
  const [locateNote, setLocateNote] = useState<string | null>(null);

  /**
   * สำเนาของ viewport ไว้ให้ effect กับ native listener อ่าน
   * ถ้าให้พึ่ง state ตรงๆ listener จะต้องถอด-ใส่ใหม่ทุกครั้งที่ขนาดจอเปลี่ยน
   *
   * ไม่ต้องทำแบบเดียวกันกับ camera เพราะ event handler ถูกสร้างใหม่ทุก render
   * จึงมองเห็นค่า camera ล่าสุดอยู่แล้ว
   */
  const viewportRef = useRef(viewport);

  /** ข้อมูลระหว่างลาก เก็บใน ref เพราะเปลี่ยนถี่มากและไม่ต้อง re-render */
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startCamera: Camera;
    moved: boolean;
  } | null>(null);


  /** วัดขนาดกรอบจริง แล้วตามดูตอนหน้าต่างเปลี่ยนขนาด */
  useLayoutEffect(() => {
    const element = svgRef.current;
    if (!element) return;

    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const next = { width: rect.width, height: rect.height };
        viewportRef.current = next;
        setViewport(next);
      }
    };

    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  /**
   * ล้อเมาส์ = ซูม
   *
   * ต้องผูกเป็น native listener พร้อม passive: false เพราะ React ผูก wheel แบบ passive
   * ซึ่งเรียก preventDefault ไม่ได้ ถ้าไม่กันไว้หน้าเว็บจะเลื่อนตามล้อไปด้วย
   */
  useEffect(() => {
    const element = svgRef.current;
    if (!element) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();

      const rect = element.getBoundingClientRect();
      const anchor = { x: event.clientX - rect.left, y: event.clientY - rect.top };

      // deltaY ติดลบ = หมุนขึ้น = ซูมเข้า
      const factor = event.deltaY < 0 ? WHEEL_ZOOM_STEP : 1 / WHEEL_ZOOM_STEP;

      setZoomFeel("quick");
      setCamera((current) => zoomAt(current, factor, viewportRef.current, anchor));
    };

    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
  }, []);

  /** sync กล้องเมื่อจังหวัดที่เลือกเปลี่ยนจากภายนอก เช่นกดปุ่มย้อนกลับของเบราว์เซอร์ */
  const [syncedCode, setSyncedCode] = useState(selectedCode);
  if (syncedCode !== selectedCode) {
    setSyncedCode(selectedCode);
    if (selectedCode) {
      const fitted = cameraFitProvince(selectedCode, viewport);
      if (fitted) {
        setZoomFeel("smooth");
        setCamera(fitted);
      }
    }
  }

  /**
   * ขอตำแหน่งผู้ใช้ — ครั้งเดียวตอนเปิดหน้าเท่านั้น
   *
   * เป็น useEffect ที่สมเหตุสมผล เพราะเป็นการคุยกับ API ภายนอกของเบราว์เซอร์
   * (geolocation + localStorage) ไม่ใช่การคำนวณที่ทำระหว่าง render ได้
   *
   * ⚠️ ต้องมี locateAttemptedRef กั้นไว้ ห้ามพึ่ง dependency array อย่างเดียว
   * เพราะ selectedCode เปลี่ยนเป็น undefined ทุกครั้งที่ผู้ใช้กดจังหวัดซ้ำเพื่อยกเลิกการเลือก
   * ถ้าปล่อยให้ effect ทำงานใหม่ กล้องจะถูกดึงกลับไปจังหวัดของผู้ใช้ทุกครั้งที่ซูมออก
   * แทนที่จะซูมออกอยู่ที่จังหวัดเดิม
   */
  const locateAttemptedRef = useRef(false);

  useEffect(() => {
    if (locateAttemptedRef.current) return;
    locateAttemptedRef.current = true;

    // เปิดมาจากลิงก์ที่ระบุจังหวัดอยู่แล้ว อย่าไปแย่งเลื่อนกล้อง
    if (selectedCode) return;

    /*
      จังหวัดที่จำไว้จากครั้งก่อน — ย้ายกล้องทันทีโดยไม่ต้องรอ geolocation
      ต้องทำที่นี่ ไม่ใช่ใน initialCamera เพราะ localStorage มีเฉพาะฝั่งเบราว์เซอร์
      ถ้าไปอ่านตอน render แรกจะทำให้ผลจากเซิร์ฟเวอร์กับเบราว์เซอร์ไม่ตรงกัน (hydration error)
    */
    const storedCode = readStoredProvinceCode();
    const storedProvince = storedCode
      ? PROVINCES.find((province) => province.code === storedCode)
      : undefined;

    if (storedProvince && isProvinceInScope(storedProvince.slug)) {
      /*
        ปิดกฎ set-state-in-effect ตรงนี้อย่างจงใจ

        กฎนี้มีไว้กันการ setState ที่ทำให้ render ซ้ำโดยไม่จำเป็น แต่กรณีนี้เป็นรูปแบบ
        ที่ถูกต้องและจำเป็น: ค่าจาก localStorage มีเฉพาะฝั่งเบราว์เซอร์ ถ้าเอาไปใส่ใน
        ค่าตั้งต้นของ useState จะทำให้ผลจากเซิร์ฟเวอร์ไม่ตรงกับเบราว์เซอร์ (hydration error)
        การ render ซ้ำหนึ่งครั้งจึงเป็นราคาที่ต้องจ่าย และถูกกว่าการที่ React ทิ้ง DOM
        ทั้งก้อนแล้ววาดใหม่เพราะ hydration ไม่ผ่าน

        setZoomFeel("none") เพื่อให้กระโดดไปเลยไม่ต้องมีอนิเมชั่น — ผู้ใช้เพิ่งเปิดหน้า
        ยังไม่ทันเห็นภาพแรก การเห็นแผนที่ไถลไปมาเองจะดูเหมือนเว็บทำงานผิด
      */
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setZoomFeel("none");
      setCamera((current) => cameraOnProvince(storedProvince.code, viewportRef.current) ?? current);
    }

    if (!("geolocation" in navigator)) return;

    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (cancelled) return;

        const province = findNearestProvince(coords.latitude, coords.longitude);
        const inScope = province ? isProvinceInScope(province.slug) : false;

        // ปักหมุดเสมอเมื่อได้รับอนุญาต แม้อยู่นอกภาค — ผู้ใช้อนุญาตแล้วก็ควรเห็นตัวเองบนแผนที่
        setUserLocation({
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          inScope,
        });

        // อยู่นอกภาคที่เปิดรับงาน — คงมุมมองทั้งภาคไว้ ดีกว่าพาไปจอดที่พื้นที่ที่ไม่มีงานเลย
        // และไม่จำจังหวัดนี้ไว้ด้วย เพราะครั้งหน้าก็จะเปิดมาเจอที่ว่างเหมือนเดิม
        if (!province || !inScope) return;

        rememberProvince(province.code);
        setZoomFeel("smooth");
        setCamera((current) => cameraOnProvince(province.code, viewportRef.current) ?? current);
      },
      () => {
        // ปฏิเสธสิทธิ์หรือหาตำแหน่งไม่ได้ — อยู่ที่มุมมองตั้งต้นต่อไปเงียบๆ
      },
      { timeout: 8_000, maximumAge: 600_000 },
    );

    return () => {
      cancelled = true;
    };
  }, [selectedCode]);

  const summaryByCode = useMemo(
    () => new Map(summary.map((item) => [item.code, item])),
    [summary],
  );

  const transform = useMemo(() => toTransform(camera, viewport), [camera, viewport]);

  /**
   * ชื่อจังหวัดที่จะวาด — เฉพาะที่อยู่ในกรอบที่มองเห็น และเฉพาะตอนซูมเข้าพอสมควร
   * ถ้าวาดครบ 77 จังหวัดตลอดเวลา ตัวหนังสือจะทับกันจนอ่านไม่ออกตอนซูมออก
   */
  const labels = useMemo(() => {
    if (camera.visibleHeight > LABEL_VISIBLE_HEIGHT_LIMIT) return [];

    const bounds = visibleBounds(camera, viewport);

    return PROVINCES.flatMap((province) => {
      if (HIDDEN_PROVINCE_LABELS.has(province.slug)) return [];

      const anchor = PROVINCE_LABEL_ANCHORS[province.code];
      if (!anchor) return [];

      // ค่าปรับด้วยมือจาก province-label-offsets.ts ทับตำแหน่งที่คำนวณอัตโนมัติ
      const [dx, dy] = PROVINCE_LABEL_OFFSETS[province.slug] ?? [0, 0];
      const labelX = anchor[0] + dx;
      const labelY = anchor[1] + dy;

      const inView =
        labelX >= bounds.minX &&
        labelX <= bounds.maxX &&
        labelY >= bounds.minY &&
        labelY <= bounds.maxY;

      return inView ? [{ code: province.code, name: province.nameTh, x: labelX, y: labelY }] : [];
    });
  }, [camera, viewport]);

  /**
   * ขนาดตัวอักษรในหน่วยแผนที่ ที่จะออกมาเท่ากับ LABEL_FONT_PX บนจอ
   * ต้องคำนวณกลับ เพราะตัวหนังสืออยู่ใน <g> ที่ถูกซูมไปด้วย
   */
  const labelFontSize = pixelsToMapUnits(LABEL_FONT_PX, camera, viewport);

  /**
   * หมุดงานทั้งหมด แปลง lat/lng เป็นพิกัดแผนที่ครั้งเดียว
   * ไม่ขึ้นกับกล้อง จึงคำนวณใหม่เฉพาะตอนข้อมูลงานเปลี่ยน
   */
  const allPins = useMemo(
    () => pinEvents.map((event) => ({ event, point: projectToMap(event.lng, event.lat) })),
    [pinEvents],
  );

  /**
   * ขนาดหนึ่งพิกเซลบนจอ คิดเป็นหน่วยแผนที่
   *
   * ใช้แปลงขนาดที่ออกแบบไว้เป็นพิกเซล (หมุด วงกลุ่ม ตัวหนังสือ) ให้เป็นหน่วยแผนที่
   * เพราะทุกอย่างอยู่ใน <g> ที่ถูกซูม ถ้าใส่ค่าพิกเซลตรงๆ หมุดจะโตตามการซูมไปด้วย
   */
  const unitPerPx = pixelsToMapUnits(1, camera, viewport);

  /** รัศมีหมุดในหน่วยแผนที่ ที่จะออกมาเท่ากับ PIN_RADIUS_PX บนจอไม่ว่าซูมแค่ไหน */
  const pinRadius = PIN_RADIUS_PX * unitPerPx;

  /** ขนาดช่องตารางในหน่วยแผนที่ — เล็กลงเมื่อซูมเข้า กลุ่มจึงคลายตัวเอง */
  const clusterCellSize = CLUSTER_CELL_PX * unitPerPx;

  /**
   * จัดกลุ่มหมุด "ทั้งประเทศ" ก่อน แล้วค่อยกรองว่าอันไหนอยู่ในกรอบที่เห็น
   *
   * ⚠️ ลำดับนี้สลับไม่ได้ ถ้ากรองก่อนจัดกลุ่ม กลุ่มที่คร่อมขอบจอจะนับเฉพาะสมาชิก
   * ที่อยู่ในจอ แล้วแสดงตัวเลขผิด (เช่นมี 8 งานแต่ขึ้น 6) พอเลื่อนแผนที่ตัวเลขก็จะ
   * เปลี่ยนไปมาเอง — และการจัดกลุ่มก็จะไม่นิ่งเพราะสมาชิกเข้าออกตามการเลื่อน
   */
  const clusters = useMemo(
    () => clusterPins(allPins, clusterCellSize),
    [allPins, clusterCellSize],
  );

  /** เฉพาะกลุ่มที่อยู่ในกรอบที่มองเห็น — ไม่ต้องวาดของที่ถูกครอบตัดออกไปแล้ว */
  const visibleClusters = useMemo(() => {
    if (camera.visibleHeight > PIN_VISIBLE_HEIGHT_LIMIT) return [];

    const bounds = visibleBounds(camera, viewport);

    return clusters.filter(
      (cluster) =>
        cluster.x >= bounds.minX &&
        cluster.x <= bounds.maxX &&
        cluster.y >= bounds.minY &&
        cluster.y <= bounds.maxY,
    );
  }, [clusters, camera, viewport]);

  /** ชื่องานข้างหมุด — ต้องซูมใกล้พอ และจุดต้องไม่แน่นจนป้ายทับกัน */
  const showPinTitles =
    camera.visibleHeight <= PIN_TITLE_VISIBLE_HEIGHT &&
    visibleClusters.length <= PIN_TITLE_MAX_COUNT;
  const pinTitleFontSize = PIN_TITLE_FONT_PX * unitPerPx;

  /**
   * จุดที่เปิดการ์ดอยู่ — เก็บ id ของกลุ่ม เพราะ object ถูกสร้างใหม่ทุกครั้งที่ re-render
   *
   * id ของกลุ่มอ้างอิงตำแหน่งช่องตาราง จึงคงที่ตอนผู้ใช้เลื่อนแผนที่ (การ์ดไม่หลุด)
   * แต่เปลี่ยนเมื่อซูม ซึ่งเป็นพฤติกรรมที่ต้องการ — พอกลุ่มถูกจัดใหม่ การ์ดเดิมก็หมดความหมาย
   */
  const [openClusterId, setOpenClusterId] = useState<string | null>(null);
  const openCluster = visibleClusters.find((cluster) => cluster.id === openClusterId);

  /**
   * กดที่จุดบนแผนที่
   *
   * หมุดเดี่ยว: กดครั้งแรกเปิดการ์ด กดซ้ำไปหน้ารายละเอียด
   * กลุ่ม: ซูมเข้าไปให้แตกออก — แต่ถ้าซูมสุดเพดานแล้วยังไม่แตก (เช่นงานในลานเดียวกัน)
   *        ให้เปิดรายการแทน ไม่งั้นผู้ใช้จะกดแล้วรู้สึกว่าไม่มีอะไรเกิดขึ้น
   */
  const handleClusterClick = useCallback(
    (cluster: PinCluster) => {
      // เพิ่งลากแผนที่มา ไม่ใช่ตั้งใจกดจุด (อ่าน ref ตรงๆ เพื่อให้ callback ไม่ต้องผูก dependency)
      if (dragRef.current?.moved) return;

      if (cluster.members.length === 1) {
        const { event } = cluster.members[0];
        if (cluster.id === openClusterId) router.push(`/events/${event.slug}`);
        else setOpenClusterId(cluster.id);
        return;
      }

      const view = viewportRef.current;
      const aspect = view.height > 0 ? view.width / view.height : 1;

      // ขอระดับซูมที่พอดีกับกลุ่ม แล้วอ่านค่าที่ได้จริง — clampCamera อาจบีบด้วยเพดาน
      const target = cameraOnPoint(
        cluster,
        clusterSpreadHeight(cluster, aspect) ?? camera.visibleHeight,
        view,
      );

      if (willSplit(cluster, CLUSTER_CELL_PX * pixelsToMapUnits(1, target, view))) {
        setZoomFeel("smooth");
        setCamera(target);
        setOpenClusterId(null);
        return;
      }

      setOpenClusterId(cluster.id);
    },
    [camera.visibleHeight, openClusterId, router],
  );

  const navigateTo = useCallback(
    (provinceSlug: string | null) => {
      const params = new URLSearchParams(baseParams);
      if (provinceSlug) params.set("province", provinceSlug);

      const query = params.toString();
      startTransition(() => router.push(query ? `/map?${query}` : "/map", { scroll: false }));
    },
    [baseParams, router],
  );

  /** กดจังหวัดเดิมซ้ำ = ซูมออกกลับไประดับภาค และปิดแผงรายละเอียด */
  const toggleProvince = useCallback(
    (code: string, slug: string) => {
      setZoomFeel("smooth");

      if (code === selectedCode) {
        const next = cameraOnProvince(code, viewportRef.current);
        if (next) setCamera(next);
        navigateTo(null);
        return;
      }

      // ซูมทันทีฝั่ง client ส่วนเนื้อหาในแผงจะตามมาจากเซิร์ฟเวอร์
      const fitted = cameraFitProvince(code, viewportRef.current);
      if (fitted) setCamera(fitted);
      navigateTo(slug);
    },
    [navigateTo, selectedCode],
  );

  // ---------------------------------------------------------------------------
  // ลากเลื่อนแผนที่ (Pointer Events จัดการทั้งเมาส์และนิ้วด้วยโค้ดชุดเดียว)
  // ---------------------------------------------------------------------------

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    // เฉพาะปุ่มซ้าย/นิ้ว — ปล่อยคลิกขวาให้เมนูบริบทของเบราว์เซอร์
    if (event.button !== 0) return;

    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startCamera: camera,
      moved: false,
    };

    // ⚠️ ห้ามเรียก setPointerCapture ตรงนี้
    // การจับ pointer ไว้ที่ตัว SVG ทำให้ event click ถูกเปลี่ยนเป้าหมายมาที่ SVG
    // แทนที่จะเป็น <path> ของจังหวัด ผลคือกดจังหวัดแล้วไม่มีอะไรเกิดขึ้นเลย
    // จึงเลื่อนไปจับเอาตอนที่รู้แน่แล้วว่าเป็นการลาก (ดู handlePointerMove)
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;

    if (!drag.moved) {
      if (Math.hypot(deltaX, deltaY) < DRAG_THRESHOLD_PX) return;

      drag.moved = true;
      setZoomFeel("none");

      // ถึงตรงนี้แน่ใจแล้วว่าลาก ไม่ใช่คลิก จับ pointer ไว้ได้โดยไม่กระทบการเลือกจังหวัด
      // ต้องครอบ try/catch เพราะ setPointerCapture โยน NotFoundError ได้ถ้า pointer
      // ถูกยกเลิกไปแล้ว ถ้าปล่อยให้ throw จะตัดโค้ดเลื่อนกล้องข้างล่างทิ้งทั้งหมด
      // แล้วการลากจะพังเงียบๆ ทั้งที่จับ pointer ไม่ได้ก็ยังลากต่อได้อยู่
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // จับไม่ได้ก็ยังลากได้ตราบใดที่เมาส์ยังอยู่บนแผนที่
      }
    }

    // ลากไปทางขวา = กล้องเลื่อนไปทางซ้าย จึงเป็นเครื่องหมายลบ
    setCamera(
      clampCamera(
        {
          ...drag.startCamera,
          cx: drag.startCamera.cx - pixelsToMapUnits(deltaX, drag.startCamera, viewport),
          cy: drag.startCamera.cy - pixelsToMapUnits(deltaY, drag.startCamera, viewport),
        },
        viewport,
      ),
    );
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const wasDragging = drag.moved;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (wasDragging) {
      // เคลียร์หลัง event click ทำงานเสร็จ เพื่อให้ justDragged ยังบอกได้ว่าเพิ่งลากมา
      setTimeout(() => {
        dragRef.current = null;
      }, 0);
    } else {
      dragRef.current = null;
    }
  }

  /** true เมื่อเพิ่งลากเสร็จ ใช้กันไม่ให้ปล่อยนิ้วแล้วเผลอเลือกจังหวัด */
  const justDragged = () => dragRef.current?.moved ?? false;

  /**
   * ไปที่ตำแหน่งของผู้ใช้
   *
   * ⚠️ เดิมโค้ดตรงนี้ใช้จังหวัดที่จำไว้ใน localStorage เป็นทางลัดแล้ว return ทันที
   * ผลคือหลังเข้าเว็บครั้งแรกจะไม่มีวันได้พิกัดจริงอีกเลย และหมุดตำแหน่งจะไม่ขึ้น
   * ตอนนี้จึงยึดพิกัดจริงเป็นหลัก แล้วใช้จังหวัดที่จำไว้เป็นแค่ทางลัดตอนยังรอพิกัด
   */
  function locateMe() {
    setZoomFeel("smooth");
    setLocateNote(null);

    // เคยได้พิกัดแล้วในรอบนี้ — บินไปหาเลย ไม่ต้องรอเบราว์เซอร์หาตำแหน่งใหม่
    if (userLocation) {
      flyToUserLocation(userLocation);
      return;
    }

    if (!("geolocation" in navigator)) {
      setLocateNote("เบราว์เซอร์นี้ไม่รองรับการหาตำแหน่ง");
      return;
    }

    // ระหว่างรอพิกัด ขยับกล้องไปจังหวัดที่จำไว้ก่อน เพื่อให้กดปุ่มแล้วรู้สึกว่ามีอะไรเกิดขึ้นทันที
    const storedCode = readStoredProvinceCode();
    const storedProvince = storedCode
      ? PROVINCES.find((province) => province.code === storedCode)
      : undefined;

    if (storedProvince && isProvinceInScope(storedProvince.slug)) {
      const next = cameraOnProvince(storedProvince.code, viewportRef.current);
      if (next) setCamera(next);
    }

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const province = findNearestProvince(coords.latitude, coords.longitude);
        const inScope = province ? isProvinceInScope(province.slug) : false;

        const located = {
          lat: coords.latitude,
          lng: coords.longitude,
          accuracy: coords.accuracy,
          inScope,
        };

        setUserLocation(located);
        if (province && inScope) rememberProvince(province.code);
        flyToUserLocation(located);
      },
      () => setLocateNote("หาตำแหน่งไม่สำเร็จ ลองตรวจการอนุญาตในเบราว์เซอร์"),
      { timeout: 8_000, maximumAge: 600_000 },
    );
  }

  /**
   * เลื่อนกล้องไปหาตำแหน่งผู้ใช้
   *
   * คนที่อยู่นอกภาคที่เปิดรับงานยังพาไปหาหมุดตัวเองได้ (แผนที่ยังแสดงทั้งประเทศอยู่)
   * แต่ต้องบอกตรงๆ ว่าบริเวณนั้นยังไม่มีงาน ไม่งั้นจะเข้าใจว่าเว็บมีข้อมูลไม่ครบ
   */
  function flyToUserLocation(location: { lat: number; lng: number; inScope: boolean }) {
    setZoomFeel("smooth");
    setCamera((current) =>
      cameraOnPoint(
        projectToMap(location.lng, location.lat),
        Math.min(current.visibleHeight, USER_LOCATION_VISIBLE_HEIGHT),
        viewportRef.current,
      ),
    );

    setLocateNote(location.inScope ? null : `ตอนนี้เปิดรับเฉพาะงานใน${ACTIVE_REGION_LABEL}`);
  }

  const zoomClass =
    zoomFeel === "none" ? undefined : zoomFeel === "quick" ? "map-zoom-quick" : "map-zoom";

  return (
    <div className="absolute inset-0 overflow-hidden">
      <svg
        ref={svgRef}
        viewBox={MAP_VIEWBOX}
        // slice = ขยายให้เต็มกรอบเสมอ ส่วนเกินถูกครอบตัด (เหมือน background-size: cover)
        preserveAspectRatio="xMidYMid slice"
        className={`map-canvas h-full w-full ${zoomFeel === "none" ? "cursor-grabbing" : "cursor-grab"}`}
        role="img"
        aria-label="แผนที่ประเทศไทย เลือกจังหวัดเพื่อดูงานที่กำลังจะจัด"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <g className={zoomClass} style={{ transform }}>
          {PROVINCES.map((province) => {
            const path = PROVINCE_PATHS[province.code];
            if (!path) return null;

            const count = summaryByCode.get(province.code)?.count ?? 0;
            const isSelected = province.code === selectedCode;

            /*
              ลำดับชั้นสายตาสามระดับ เรียงตามความสำคัญที่ผู้ใช้ควรเห็นก่อน:

                1. จังหวัดที่เลือก — เด่นที่สุดเสมอ แม้ยังไม่มีงานสักรายการ
                2. จังหวัดที่มีงาน  — ไล่เข้มตามจำนวน
                3. จังหวัดอื่น      — จางลงอีกเมื่อมีจังหวัดถูกเลือก เพื่อดันโฟกัสไปที่ตัวที่เลือก

              ต้องแยกด้วย fill ไม่ใช่แค่ stroke เพราะตอนซูมเข้าจนจังหวัดกินครึ่งจอ
              เส้นขอบบางๆ แทบมองไม่เห็น ทำให้ผู้ใช้แยกไม่ออกว่ากดเลือกอันไหนอยู่
            */
            /*
              ความเข้มวัดจากจำนวนงานจริง ไม่ใช่เทียบกับจังหวัดที่เยอะสุด

              เดิมใช้ count / maxCount ซึ่งพังตอนข้อมูลยังน้อย — จังหวัดที่มีแค่ 2 งาน
              กลายเป็นสีเข้มสุดเพราะบังเอิญเป็นจังหวัดเดียวที่มีข้อมูล ทำให้ส้มท่วมจอ
              และสื่อสารผิดว่า "ที่นี่งานเยอะมาก"
            */
            const intensity = Math.min(count / DENSITY_FULL_AT, 1);
            const densityOpacity = count === 0 ? 0.06 : 0.14 + intensity * 0.36;

            /*
              จังหวัดที่เลือกใช้สีพื้นแค่พอแยกออก แล้วไปเน้นที่เส้นขอบแทน
              เพราะพื้นที่ใหญ่ที่ลงสีจัดจะกลืนทั้งจอจนอ่านอย่างอื่นไม่ออก
              (เคยลอง 0.42 แล้วส้มจัดเต็มครึ่งจอ ดูฉูดฉาดเกินไปสำหรับธีมมืด)
            */
            const fillOpacity = isSelected
              ? Math.max(densityOpacity, 0.28)
              : selectedCode
                ? densityOpacity * 0.5
                : densityOpacity;

            const label =
              count > 0
                ? `${province.nameTh} — ${count} งาน`
                : `${province.nameTh} — ยังไม่มีงาน`;

            return (
              <path
                key={province.code}
                d={path}
                role="button"
                tabIndex={0}
                aria-label={label}
                aria-pressed={isSelected}
                onClick={() => {
                  if (justDragged()) return;
                  toggleProvince(province.code, province.slug);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    toggleProvince(province.code, province.slug);
                  }
                }}
                className="outline-none transition-[fill-opacity,stroke] focus-visible:stroke-white"
                fill="var(--color-brand-500)"
                fillOpacity={fillOpacity}
                stroke={isSelected ? "var(--color-brand-300)" : "var(--color-line)"}
                // non-scaling-stroke ทำให้เส้นขอบหนาเท่าเดิมบนจอไม่ว่าซูมแค่ไหน
                strokeWidth={isSelected ? 2.5 : 0.6}
                vectorEffect="non-scaling-stroke"
              >
                <title>{label}</title>
              </path>
            );
          })}

          {/* ชื่อจังหวัด — ไม่รับ pointer เพื่อไม่ให้บังการกดเลือกจังหวัดด้านล่าง */}
          {labels.map((item) => (
            <text
              key={item.code}
              x={item.x}
              y={item.y}
              className="map-label"
              fontSize={labelFontSize}
              textAnchor="middle"
              dominantBaseline="middle"
              pointerEvents="none"
              aria-hidden
            >
              {item.name}
            </text>
          ))}

          {/*
            จุดงาน วาดหลังชื่อจังหวัดเพื่อให้อยู่ชั้นบนสุด กดได้ไม่โดนตัวหนังสือบัง

            หมุดเดี่ยว = วงสีตามหมวดหมู่ / กลุ่ม = วงสีแบรนด์พร้อมตัวเลขบอกจำนวน
            ใช้สีต่างกันโดยตั้งใจ เพราะกลุ่มไม่ได้เป็นของหมวดหมู่ใดหมวดหมู่หนึ่ง
            ถ้าหยิบสีของสมาชิกตัวแรกมาใช้ จะสื่อสารผิดว่าทั้งกลุ่มเป็นงานประเภทนั้น
          */}
          {visibleClusters.map((cluster) => {
            const isOpen = cluster.id === openClusterId;
            const count = cluster.members.length;

            const onActivate = () => handleClusterClick(cluster);

            if (count === 1) {
              const { event } = cluster.members[0];

              return (
                <circle
                  key={cluster.id}
                  cx={cluster.x}
                  cy={cluster.y}
                  r={isOpen ? pinRadius * 1.35 : pinRadius}
                  fill={event.categoryColor}
                  stroke="var(--background)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  role="button"
                  tabIndex={0}
                  aria-label={`${event.title} — ${event.categoryNameTh}`}
                  aria-pressed={isOpen}
                  className="cursor-pointer outline-none transition-[r] focus-visible:stroke-white"
                  onClick={(clickEvent) => {
                    // กันไม่ให้คลิกทะลุไปโดนจังหวัดที่อยู่ข้างล่าง
                    clickEvent.stopPropagation();
                    onActivate();
                  }}
                  onKeyDown={(keyEvent) => {
                    if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
                    keyEvent.preventDefault();
                    onActivate();
                  }}
                >
                  <title>{event.title}</title>
                </circle>
              );
            }

            // รัศมีโตตามรากที่สองของจำนวน ไม่ใช่เชิงเส้น เพราะสิ่งที่ตาเทียบคือ "พื้นที่วง"
            // ถ้าให้รัศมีโตตรงตามจำนวน กลุ่ม 20 งานจะดูใหญ่กว่ากลุ่ม 5 งานถึง 16 เท่า
            const radiusPx = Math.min(
              CLUSTER_MIN_RADIUS_PX + Math.sqrt(count) * 2.2,
              CLUSTER_MAX_RADIUS_PX,
            );
            const radius = radiusPx * unitPerPx;
            const label = `${count} งานบริเวณนี้`;

            return (
              <g
                key={cluster.id}
                role="button"
                tabIndex={0}
                aria-label={label}
                className="cursor-pointer outline-none"
                onClick={(clickEvent) => {
                  clickEvent.stopPropagation();
                  onActivate();
                }}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key !== "Enter" && keyEvent.key !== " ") return;
                  keyEvent.preventDefault();
                  onActivate();
                }}
              >
                <title>{label}</title>

                {/* วงจางรอบนอก — บอกว่านี่คือ "กลุ่ม" ไม่ใช่หมุดใหญ่ผิดปกติ */}
                <circle
                  cx={cluster.x}
                  cy={cluster.y}
                  r={radius * 1.45}
                  fill="var(--color-brand-500)"
                  fillOpacity={0.25}
                />
                <circle
                  cx={cluster.x}
                  cy={cluster.y}
                  r={radius}
                  fill="var(--color-brand-500)"
                  stroke="var(--background)"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                  className="transition-[r]"
                />
                <text
                  x={cluster.x}
                  y={cluster.y}
                  fontSize={CLUSTER_COUNT_FONT_PX * unitPerPx}
                  fontWeight={700}
                  fill="var(--background)"
                  textAnchor="middle"
                  dominantBaseline="central"
                  pointerEvents="none"
                  aria-hidden
                >
                  {count}
                </text>
              </g>
            );
          })}

          {/* ชื่องานข้างหมุด — วาดแยกจากวง เพื่อให้ตัวหนังสืออยู่ชั้นบนสุดไม่ถูกจุดอื่นบัง */}
          {showPinTitles
            ? visibleClusters.flatMap((cluster) => {
                // กลุ่มมีชื่ออยู่แล้วในตัวเลข ใส่ชื่องานเพิ่มจะสื่อผิดว่าทั้งกลุ่มคืองานนั้น
                if (cluster.members.length !== 1) return [];
                const { event } = cluster.members[0];

                return [
                  <text
                    key={`${cluster.id}-title`}
                    x={cluster.x + pinRadius * 1.6}
                    y={cluster.y}
                    className="map-label"
                    fontSize={pinTitleFontSize}
                    dominantBaseline="middle"
                    pointerEvents="none"
                    aria-hidden
                  >
                    {event.title.length > PIN_TITLE_MAX_CHARS
                      ? `${event.title.slice(0, PIN_TITLE_MAX_CHARS)}…`
                      : event.title}
                  </text>,
                ];
              })
            : null}

          {/*
            หมุดตำแหน่งผู้ใช้ — วาดท้ายสุดจึงอยู่ชั้นบนสุดเสมอ หาตัวเองเจอได้แม้หมุดงานแน่น
            pointerEvents="none" ทั้งก้อน สำคัญมาก: ถ้าไม่ใส่ หมุดนี้จะบังการกดเลือกจังหวัด
            และการกดหมุดงานที่อยู่ข้างใต้ ทั้งที่มันเป็นแค่เครื่องหมายบอกตำแหน่ง ไม่ใช่ปุ่ม
          */}
          {userLocation
            ? (() => {
                const point = projectToMap(userLocation.lng, userLocation.lat);
                const radius = USER_LOCATION_RADIUS_PX * unitPerPx;

                /*
                  วงความแม่นยำ — แปลงเมตรเป็นหน่วยแผนที่ (1 หน่วย ≈ 1.49 กม.)
                  วาดเฉพาะตอนที่ใหญ่กว่าตัวจุดจริงๆ เพราะตำแหน่งจาก GPS แม่นระดับ 20 เมตร
                  ซึ่งเล็กกว่าจุดเสมอ วาดไปก็ไม่เห็น แต่ตำแหน่งจาก Wi-Fi อาจคลาด 2–5 กม.
                  ซึ่งควรบอกผู้ใช้ตามตรงว่าระบบไม่ได้มั่นใจขนาดนั้น
                */
                const accuracyRadius = userLocation.accuracy / METERS_PER_MAP_UNIT;

                return (
                  <g pointerEvents="none" aria-hidden>
                    {accuracyRadius > radius ? (
                      <circle
                        cx={point.x}
                        cy={point.y}
                        r={accuracyRadius}
                        fill="var(--user-location)"
                        fillOpacity={0.12}
                        stroke="var(--user-location)"
                        strokeOpacity={0.3}
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                      />
                    ) : null}

                    <circle
                      className="user-location-pulse"
                      cx={point.x}
                      cy={point.y}
                      r={radius * 2}
                      fill="var(--user-location)"
                    />

                    <circle
                      cx={point.x}
                      cy={point.y}
                      r={radius}
                      fill="var(--user-location)"
                      stroke="#ffffff"
                      strokeWidth={2}
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                );
              })()
            : null}
        </g>
      </svg>

      {openCluster
        ? (() => {
            const screen = mapToScreen(openCluster, camera, viewport);
            const close = () => setOpenClusterId(null);

            /*
              จุดอยู่ครึ่งบนของแผนที่ → วางการ์ดไว้ใต้จุด ไม่งั้นการ์ดจะทะลุขอบบนออกไป
              สำคัญมากบนมือถือ ที่แถบแผนที่เหลือความสูงไม่ถึงครึ่งจอเมื่อแผงจังหวัดเปิดอยู่
              — การ์ดรายการกลุ่มสูงราว 314px ซึ่งสูงกว่าพื้นที่เหนือจุดเกือบตลอด
            */
            const placement = screen.y < viewport.height / 2 ? "below" : "above";

            // หมุดเดี่ยว = การ์ดรายละเอียดงาน / กลุ่มที่ซูมแล้วยังไม่แตก = รายการให้เลือก
            return openCluster.members.length === 1 ? (
              <EventPinCard
                event={openCluster.members[0].event}
                x={screen.x}
                y={screen.y}
                placement={placement}
                onClose={close}
              />
            ) : (
              <ClusterPinCard
                events={openCluster.members.map((member) => member.event)}
                x={screen.x}
                y={screen.y}
                placement={placement}
                onClose={close}
              />
            );
          })()
        : null}

      <MapZoomControls
        onZoomIn={() => {
          setZoomFeel("smooth");
          setCamera((current) => zoomBy(current, ZOOM_STEP, viewportRef.current));
        }}
        onZoomOut={() => {
          setZoomFeel("smooth");
          setCamera((current) => zoomBy(current, 1 / ZOOM_STEP, viewportRef.current));
        }}
        onWholeRegion={() => {
          setZoomFeel("smooth");
          setCamera(regionCamera(viewportRef.current));
        }}
        onLocate={locateMe}
      />

      {/*
        ข้อความแจ้งผลการหาตำแหน่ง
        จำเป็นเพราะบางกรณีกดปุ่มแล้วภาพแทบไม่ขยับ (เช่นอยู่นอกภาค หรือปฏิเสธสิทธิ์)
        ถ้าไม่บอกอะไรเลยผู้ใช้จะเข้าใจว่าปุ่มเสีย

        วางกลางล่างแบบ toast ไม่ใช่ชิดขวาใกล้ปุ่ม เพราะกลุ่มปุ่มควบคุมสูงเกือบ 200px
        ข้อความที่วางข้างๆ จะไปทับปุ่มซูมบนจอมือถือ (ตรวจแล้วเจอจริงบนจอ 375×812)
        z-30 ให้ลอยเหนือแผงจังหวัด (z-20) เผื่อกรณีเปิดแผงค้างไว้แล้วกดปุ่มหาตำแหน่ง
      */}
      {locateNote ? (
        <p
          role="status"
          className="absolute bottom-8 left-1/2 z-30 max-w-[80%] -translate-x-1/2 rounded-xl border border-line bg-surface/95 px-3 py-2 text-center text-xs text-muted backdrop-blur"
        >
          {locateNote}
        </p>
      ) : null}

      {/*
        เครดิตแหล่งข้อมูลแผนที่ — เงื่อนไขบังคับของใบอนุญาต CC BY 4.0 ห้ามลบ
        วางทับบนแผนที่ตามธรรมเนียมแอปแผนที่ (เหมือนที่ Google/OSM ทำ)
        เพราะหน้านี้ไม่มี footer ให้ใส่แล้ว
      */}
      <p className="pointer-events-none absolute bottom-1 left-2 z-10 text-[10px] text-muted/70">
        ขอบเขตจังหวัด:{" "}
        <a
          href="https://github.com/DevelopedbyWill/thailand-canonical-admin-names"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto underline-offset-2 hover:underline"
        >
          Thailand Canonical Admin Names
        </a>{" "}
        (CC BY 4.0)
      </p>
    </div>
  );
}

/** ปุ่มควบคุมมุมขวา ตามธรรมเนียมแอปแผนที่ทั่วไป */
function MapZoomControls({
  onZoomIn,
  onZoomOut,
  onWholeRegion,
  onLocate,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onWholeRegion: () => void;
  onLocate: () => void;
}) {
  const round =
    "flex size-11 items-center justify-center rounded-xl border border-line bg-surface/90 backdrop-blur transition-colors hover:bg-surface-muted";

  return (
    <div className="absolute right-3 bottom-8 z-10 flex flex-col gap-2 lg:top-1/2 lg:bottom-auto lg:-translate-y-1/2">
      <button type="button" onClick={onLocate} aria-label="ไปที่ตำแหน่งของฉัน" className={round}>
        <span aria-hidden className="text-lg">
          📍
        </span>
      </button>

      <div className="flex flex-col overflow-hidden rounded-xl border border-line backdrop-blur">
        <button
          type="button"
          onClick={onZoomIn}
          aria-label="ซูมเข้า"
          className="flex size-11 items-center justify-center bg-surface/90 text-xl transition-colors hover:bg-surface-muted"
        >
          <span aria-hidden>+</span>
        </button>
        <div className="h-px bg-line" />
        <button
          type="button"
          onClick={onZoomOut}
          aria-label="ซูมออก"
          className="flex size-11 items-center justify-center bg-surface/90 text-xl transition-colors hover:bg-surface-muted"
        >
          <span aria-hidden>−</span>
        </button>
      </div>

      {/*
        มุมมอง "ถอยสุด" ของเว็บนี้คือทั้งภาค ไม่ใช่ทั้งประเทศ จึงใช้ไอคอนเข็มทิศแทนธงชาติ
        ธงชาติสื่อว่ากดแล้วจะเห็นทั้งไทย ซึ่งไม่ตรงกับสิ่งที่เกิดขึ้นจริง
      */}
      <button
        type="button"
        onClick={onWholeRegion}
        aria-label={`ดูทั้ง${ACTIVE_REGION_LABEL}`}
        className={round}
      >
        <span aria-hidden>🧭</span>
      </button>
    </div>
  );
}
