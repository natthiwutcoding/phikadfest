"use client";

import { useState } from "react";

import { EventCard } from "@/components/event-card";
import { ACTIVE_REGION_LABEL } from "@/lib/region-scope";
import type { EventWithRelations } from "@/lib/types";

type State =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "loading" }
  | { status: "ready"; events: EventWithRelations[] }
  | { status: "error"; message: string };

/** แปลง error ของ Geolocation API เป็นข้อความที่บอกผู้ใช้ว่าต้องทำอะไรต่อ */
function geolocationMessage(error: GeolocationPositionError): string {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "คุณยังไม่ได้อนุญาตให้เว็บใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่งในเบราว์เซอร์แล้วลองใหม่ หรือเลือกจังหวัดเองด้านล่าง";
    case error.POSITION_UNAVAILABLE:
      return "หาตำแหน่งไม่สำเร็จ ลองเปิด GPS หรือเชื่อมต่อ Wi-Fi แล้วลองใหม่";
    case error.TIMEOUT:
      return "ใช้เวลาหาตำแหน่งนานเกินไป ลองอีกครั้ง";
    default:
      return "เกิดข้อผิดพลาดในการหาตำแหน่ง";
  }
}

export function NearbyEvents() {
  const [state, setState] = useState<State>({ status: "idle" });

  function findNearby() {
    if (!("geolocation" in navigator)) {
      setState({
        status: "error",
        message: "เบราว์เซอร์นี้ไม่รองรับการระบุตำแหน่ง ลองเลือกจังหวัดเองด้านล่างแทน",
      });
      return;
    }

    setState({ status: "locating" });

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        setState({ status: "loading" });
        try {
          const params = new URLSearchParams({
            lat: String(coords.latitude),
            lng: String(coords.longitude),
          });
          const response = await fetch(`/api/events/nearby?${params}`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          const data: { events: EventWithRelations[] } = await response.json();
          setState({ status: "ready", events: data.events });
        } catch {
          setState({ status: "error", message: "โหลดข้อมูลงานไม่สำเร็จ ลองใหม่อีกครั้ง" });
        }
      },
      (error) => setState({ status: "error", message: geolocationMessage(error) }),
      { timeout: 10_000, maximumAge: 300_000 },
    );
  }

  const busy = state.status === "locating" || state.status === "loading";

  return (
    <section aria-labelledby="nearby-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="nearby-heading" className="text-xl font-bold">
          งานใกล้ฉัน
        </h2>

        {state.status !== "idle" ? (
          <button
            type="button"
            onClick={findNearby}
            disabled={busy}
            className="text-sm font-medium text-brand-400 underline-offset-4 hover:underline disabled:opacity-50"
          >
            ค้นหาใหม่
          </button>
        ) : null}
      </div>

      {state.status === "idle" ? (
        <div className="mt-3 rounded-2xl border border-dashed border-line bg-surface p-6 text-center">
          <p className="text-sm text-muted">
            กดปุ่มด้านล่างเพื่อดูงานที่จัดใกล้ตำแหน่งของคุณ ภายในรัศมี 100 กิโลเมตร
          </p>
          <button
            type="button"
            onClick={findNearby}
            className="glow-brand mt-4 min-h-12 rounded-xl bg-brand-600 px-6 font-medium text-white transition-colors hover:bg-brand-700"
          >
            <span aria-hidden className="mr-1.5">
              📍
            </span>
            ค้นหางานใกล้ฉัน
          </button>
          <p className="mt-3 text-xs text-muted">
            เราใช้ตำแหน่งเพื่อคำนวณระยะทางเท่านั้น ไม่ได้บันทึกเก็บไว้
          </p>
        </div>
      ) : null}

      {busy ? (
        <p className="mt-3 rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted">
          {state.status === "locating" ? "กำลังหาตำแหน่งของคุณ…" : "กำลังค้นหางานใกล้เคียง…"}
        </p>
      ) : null}

      {state.status === "error" ? (
        <p className="mt-3 rounded-2xl border border-amber-900 bg-amber-950/50 p-4 text-sm text-amber-100">
          {state.message}
        </p>
      ) : null}

      {state.status === "ready" ? (
        state.events.length > 0 ? (
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {state.events.map((event) => (
              <li key={event.id}>
                <EventCard event={event} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 rounded-2xl border border-line bg-surface p-6 text-center text-sm text-muted">
            ยังไม่มีงานในรัศมี 100 กม. จากคุณ ลองดูงานทั้ง{ACTIVE_REGION_LABEL}ด้านล่างแทน
          </p>
        )
      ) : null}
    </section>
  );
}
