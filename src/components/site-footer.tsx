import Link from "next/link";

import { SITE } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface-muted">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:grid-cols-3">
        <div>
          <p className="font-bold">
            <span aria-hidden>📍</span> {SITE.name}
          </p>
          <p className="mt-2 text-sm text-muted">{SITE.tagline}</p>
        </div>

        <div className="text-sm">
          <p className="font-semibold">เมนู</p>
          <ul className="mt-2 space-y-1.5">
            <li>
              <Link href="/map" className="text-muted hover:text-foreground">
                แผนที่งานทั่วไทย
              </Link>
            </li>
            <li>
              <Link href="/events" className="text-muted hover:text-foreground">
                ค้นหางาน
              </Link>
            </li>
            <li>
              <Link href="/submit" className="text-muted hover:text-foreground">
                แจ้งงานเข้าระบบ
              </Link>
            </li>
          </ul>
        </div>

        <div className="text-sm">
          <p className="font-semibold">ช่วยกันเติมข้อมูล</p>
          <p className="mt-2 text-muted">
            รู้จักงานที่ยังไม่มีในเว็บ? ส่งเข้ามาได้เลย ทีมงานจะตรวจสอบก่อนเผยแพร่
          </p>
        </div>
      </div>

      <div className="border-t border-line">
        <div className="mx-auto max-w-6xl space-y-1.5 px-4 py-4 text-xs text-muted">
          <p>
            © {new Date().getFullYear()} {SITE.name}
          </p>
          {/*
            เครดิตนี้เป็นเงื่อนไขบังคับของใบอนุญาต CC BY 4.0 ที่ข้อมูลแผนที่ใช้อยู่
            ห้ามลบออก ต้องระบุครบสามอย่าง: ชื่อผลงาน / ผู้สร้าง / ใบอนุญาต
          */}
          <p>
            ข้อมูลขอบเขตจังหวัดจาก{" "}
            <a
              href="https://github.com/DevelopedbyWill/thailand-canonical-admin-names"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Thailand Canonical Admin Names
            </a>{" "}
            โดย DevelopedbyWill (
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              CC BY 4.0
            </a>
            ) — อ้างอิงข้อมูลกรมแผนที่ทหารผ่าน OCHA CODs
          </p>
        </div>
      </div>
    </footer>
  );
}
