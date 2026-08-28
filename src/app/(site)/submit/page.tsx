import type { Metadata } from "next";

import { SubmitForm } from "@/components/submit-form";

export const metadata: Metadata = {
  title: "แจ้งงานเข้าระบบ",
  description:
    "ส่งข้อมูลงานเทศกาลหรือกิจกรรมที่คุณรู้จักเข้ามาได้ฟรี ทีมงานจะตรวจสอบก่อนเผยแพร่",
  alternates: { canonical: "/submit" },
};

export default function SubmitPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">แจ้งงานเข้าระบบ</h1>
      <p className="mt-2 text-muted text-pretty">
        รู้จักงานที่ยังไม่มีในเว็บ? ส่งเข้ามาได้เลย ไม่มีค่าใช้จ่าย
        ทีมงานจะตรวจสอบข้อมูลก่อนเผยแพร่ เพื่อให้คนที่วางแผนเดินทางตามข้อมูลนี้ได้จริง
      </p>

      <SubmitForm />
    </div>
  );
}
