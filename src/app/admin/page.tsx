import type { Metadata } from "next";
import Link from "next/link";

import { logout } from "@/app/(site)/login/actions";
import { reviewEvent } from "@/app/admin/actions";
import { requireAdmin } from "@/lib/auth";
import { CATEGORIES } from "@/lib/data/categories";
import { PROVINCES } from "@/lib/data/provinces";
import { formatDateRange } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "จัดการงาน",
  robots: { index: false, follow: false },
};

/** แถวที่ดึงมาแสดงในคิวตรวจ — เอาเฉพาะที่ต้องใช้ตัดสินใจอนุมัติ */
interface PendingRow {
  id: string;
  title: string;
  description: string | null;
  category_id: number;
  province_id: number;
  venue_name: string | null;
  start_at: string;
  end_at: string;
  organizer_contact: string | null;
  source_url: string | null;
  created_at: string;
}

// ตารางค้นหาจาก id — ตาราง events เก็บเป็น foreign key ส่วนชื่อที่แสดงอยู่ในค่าคงที่ของแอป
const PROVINCE_BY_ID = new Map(PROVINCES.map((province) => [province.id, province]));
const CATEGORY_BY_ID = new Map(CATEGORIES.map((category) => [category.id, category]));

export default async function AdminPage() {
  // เด้งออกทันทีถ้าไม่ใช่แอดมิน — ต้องเรียกก่อนแตะข้อมูลใดๆ
  const session = await requireAdmin();

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, description, category_id, province_id, venue_name, start_at, end_at, organizer_contact, source_url, created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  const pending = (data ?? []) as PendingRow[];

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">งานรอตรวจสอบ</h1>
          <p className="mt-1 text-sm text-muted">เข้าสู่ระบบเป็น {session.email ?? "แอดมิน"}</p>
        </div>

        <form action={logout}>
          <button
            type="submit"
            className="min-h-11 rounded-xl border border-line px-4 text-sm transition-colors hover:border-brand-400"
          >
            ออกจากระบบ
          </button>
        </form>
      </header>

      {error ? (
        <p
          role="alert"
          className="mt-6 rounded-xl border border-red-900 bg-red-950/50 p-4 text-sm text-red-100"
        >
          โหลดข้อมูลไม่สำเร็จ: {error.message}
        </p>
      ) : null}

      {pending.length === 0 && !error ? (
        <p className="mt-6 rounded-2xl border border-dashed border-line bg-surface p-10 text-center text-muted">
          ไม่มีงานรอตรวจสอบ
        </p>
      ) : null}

      <ul className="mt-6 space-y-4">
        {pending.map((event) => {
          const province = PROVINCE_BY_ID.get(event.province_id);
          const category = CATEGORY_BY_ID.get(event.category_id);

          return (
            <li key={event.id} className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
              <h2 className="font-semibold">{event.title}</h2>

              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <Field label="วันที่" value={formatDateRange(event.start_at, event.end_at)} />
                <Field
                  label="สถานที่"
                  value={[event.venue_name, province?.nameTh].filter(Boolean).join(" · ") || "—"}
                />
                <Field label="หมวดหมู่" value={category?.nameTh ?? "—"} />
                <Field label="ติดต่อผู้จัด" value={event.organizer_contact ?? "—"} />
              </dl>

              {event.description ? (
                <p className="mt-3 text-sm whitespace-pre-line text-muted">{event.description}</p>
              ) : null}

              {event.source_url ? (
                <a
                  href={event.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-sm text-brand-400 underline-offset-4 hover:underline"
                >
                  ดูแหล่งข้อมูลต้นทาง ↗
                </a>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <form action={reviewEvent}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="decision" value="approved" />
                  <button
                    type="submit"
                    className="min-h-11 rounded-xl bg-emerald-600 px-5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
                  >
                    อนุมัติ
                  </button>
                </form>

                <form action={reviewEvent}>
                  <input type="hidden" name="eventId" value={event.id} />
                  <input type="hidden" name="decision" value="rejected" />
                  <button
                    type="submit"
                    className="min-h-11 rounded-xl border border-line px-5 text-sm transition-colors hover:border-red-700 hover:text-red-300"
                  >
                    ปฏิเสธ
                  </button>
                </form>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-8 text-sm text-muted">
        <Link href="/" className="text-brand-400 underline-offset-4 hover:underline">
          ← กลับหน้าเว็บ
        </Link>
      </p>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-0.5">{value}</dd>
    </div>
  );
}
