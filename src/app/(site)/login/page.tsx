import type { Metadata } from "next";

import { LoginForm } from "@/components/login-form";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ",
  // หน้านี้ไม่มีประโยชน์กับคนค้นหา และไม่ควรถูก index
  robots: { index: false, follow: false },
};

function one(value: string | string[] | undefined): string | undefined {
  const single = Array.isArray(value) ? value[0] : value;
  return single?.trim() || undefined;
}

export default async function LoginPage(props: PageProps<"/login">) {
  const params = await props.searchParams;
  const next = one(params.next) ?? "/admin";
  const errorCode = one(params.error);

  return (
    <div className="mx-auto max-w-sm px-4 py-16">
      <h1 className="text-2xl font-bold tracking-tight">เข้าสู่ระบบ</h1>
      <p className="mt-2 text-sm text-muted text-pretty">
        สำหรับทีมงานที่ดูแลข้อมูลงานเท่านั้น
      </p>

      {errorCode === "forbidden" ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-amber-900 bg-amber-950/50 p-4 text-sm text-amber-100"
        >
          บัญชีนี้เข้าสู่ระบบแล้ว แต่ยังไม่มีสิทธิ์แอดมิน
        </p>
      ) : null}

      {errorCode === "not-configured" ? (
        <p
          role="alert"
          className="mt-4 rounded-xl border border-amber-900 bg-amber-950/50 p-4 text-sm text-amber-100"
        >
          เว็บยังไม่ได้เชื่อมต่อฐานข้อมูล (โหมดพัฒนา) — ดูขั้นตอนตั้งค่าใน{" "}
          <code className="text-amber-200">docs/03-data-model.md</code>
        </p>
      ) : null}

      <LoginForm next={next} />
    </div>
  );
}
