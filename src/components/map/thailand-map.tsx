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
import { getProvince, PROVINCES } from "@/lib/data/provinces";
import { MAP_VIEWBOX, PROVINCE_LABEL_ANCHORS, PROVINCE_PATHS } from "@/lib/data/province-paths";
import type { ProvinceEventSummary } from "@/lib/events";
import {
  cameraFitProvince,
  cameraOnProvince,
  cameraWholeCountry,
  clampCamera,
  findNearestProvince,
  pixelsToMapUnits,
  toTransform,
  visibleBounds,
  ZOOM_STEP,
  zoomAt,
  zoomBy,
  type Camera,
  type Viewport,
} from "@/lib/map-camera";

/** จำจังหวัดของผู้ใช้ไว้ ครั้งหน้าจะได้เปิดมาที่เดิมโดยไม่ต้องรอขอตำแหน่งใหม่ */
const HOME_PROVINCE_KEY = "phikadfest:home-province";

/** ขยับเกินระยะนี้ถือว่าลาก ไม่ใช่กดเลือกจังหวัด */
const DRAG_THRESHOLD_PX = 5;

/** จังหวัดตั้งต้นเมื่อยังไม่รู้ว่าผู้ใช้อยู่ไหน */
const DEFAULT_PROVINCE_SLUG = "bangkok";

/** ซูมออกกว่านี้ไม่ต้องแสดงชื่อจังหวัด เพราะตัวหนังสือจะทับกันจนอ่านไม่ออก */
const LABEL_VISIBLE_HEIGHT_LIMIT = 620;

/** ขนาดตัวอักษรชื่อจังหวัดที่ต้องการให้เห็นบนจอ (พิกเซล) */
const LABEL_FONT_PX = 12;

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


/** กล้องตั้งต้น เรียกครั้งเดียวตอน mount */
function initialCamera(selectedCode: string | undefined): Camera {
  // มาจากลิงก์ที่ระบุจังหวัดอยู่แล้ว (เช่นแชร์ลิงก์มา) ให้ซูมไปจังหวัดนั้นเลย
  if (selectedCode) {
    const fitted = cameraFitProvince(selectedCode, FALLBACK_VIEWPORT);
    if (fitted) return fitted;
  }

  const storedCode = typeof window === "undefined" ? null : readStoredProvinceCode();
  const fallbackCode = getProvince(DEFAULT_PROVINCE_SLUG)?.code;

  return (
    cameraOnProvince(storedCode ?? fallbackCode ?? "", FALLBACK_VIEWPORT) ?? cameraWholeCountry()
  );
}

export function ThailandMap({ summary, selectedCode, baseParams }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  const svgRef = useRef<SVGSVGElement>(null);
  const [camera, setCamera] = useState<Camera>(() => initialCamera(selectedCode));
  const [viewport, setViewport] = useState<Viewport>(FALLBACK_VIEWPORT);
  const [zoomFeel, setZoomFeel] = useState<ZoomFeel>("smooth");

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
    if (!("geolocation" in navigator)) return;

    let cancelled = false;

    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        if (cancelled) return;

        const province = findNearestProvince(coords.latitude, coords.longitude);
        if (!province) return;

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

  /** จำนวนงานสูงสุดในจังหวัดเดียว — ใช้เป็นฐานเทียบความเข้มของสี */
  const maxCount = useMemo(
    () => summary.reduce((max, item) => Math.max(max, item.count), 0),
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

  function locateMe() {
    setZoomFeel("smooth");

    const storedCode = readStoredProvinceCode();
    if (storedCode) {
      const next = cameraOnProvince(storedCode, viewportRef.current);
      if (next) setCamera(next);
      return;
    }

    navigator.geolocation?.getCurrentPosition(({ coords }) => {
      const province = findNearestProvince(coords.latitude, coords.longitude);
      if (!province) return;

      rememberProvince(province.code);
      const target = cameraOnProvince(province.code, viewportRef.current);
      if (target) setCamera(target);
    });
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

            // ความเข้มของสีสื่อถึงจำนวนงาน — จังหวัดที่ไม่มีงานเป็นสีพื้นจางๆ
            const intensity = maxCount > 0 ? count / maxCount : 0;
            const fillOpacity = count === 0 ? 0.07 : 0.22 + intensity * 0.63;

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
                stroke={isSelected ? "var(--color-brand-200)" : "var(--color-line)"}
                // non-scaling-stroke ทำให้เส้นขอบหนาเท่าเดิมบนจอไม่ว่าซูมแค่ไหน
                strokeWidth={isSelected ? 2 : 0.6}
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
        </g>
      </svg>

      <MapZoomControls
        onZoomIn={() => {
          setZoomFeel("smooth");
          setCamera((current) => zoomBy(current, ZOOM_STEP, viewportRef.current));
        }}
        onZoomOut={() => {
          setZoomFeel("smooth");
          setCamera((current) => zoomBy(current, 1 / ZOOM_STEP, viewportRef.current));
        }}
        onWholeCountry={() => {
          setZoomFeel("smooth");
          setCamera(cameraWholeCountry());
        }}
        onLocate={locateMe}
      />

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
  onWholeCountry,
  onLocate,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onWholeCountry: () => void;
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

      <button type="button" onClick={onWholeCountry} aria-label="ดูทั้งประเทศ" className={round}>
        <span aria-hidden>🇹🇭</span>
      </button>
    </div>
  );
}
