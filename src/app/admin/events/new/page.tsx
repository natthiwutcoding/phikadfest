import type { Metadata } from "next";
import Link from "next/link";

import { AdminEventForm } from "@/components/admin/event-form";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = {
  title: "เพิ่มงานใหม่",
  robots: { index: false, follow: false },
};

export default async function NewAdminEventPage() {
  // ตรวจสิทธิ์ที่หน้าด้วย ไม่ใช่แค่ใน action — คนที่ไม่ใช่แอดมินไม่ควรเห็นแม้แต่ฟอร์มเปล่า
  await requireAdmin();

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <nav className="text-sm text-muted">
        <Link href="/admin" className="hover:text-foreground">
          ← กลับไปหน้าจัดการงาน
        </Link>
      </nav>

      <h1 className="mt-4 text-2xl font-bold tracking-tight">เพิ่มงานใหม่</h1>
      <p className="mt-1 text-sm text-muted">
        กรอกข้อมูลให้ครบที่สุดเท่าที่ตรวจสอบแล้ว — วันเวลาและสถานที่คือสิ่งที่คนใช้ตัดสินใจว่าจะไปหรือไม่
      </p>

      <AdminEventForm mode="create" />
    </div>
  );
}
