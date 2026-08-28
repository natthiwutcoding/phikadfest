import Link from "next/link";

import { SITE } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-background/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span aria-hidden className="text-xl">
            📍
          </span>
          <span className="text-lg tracking-tight">{SITE.name}</span>
        </Link>

        <nav className="ml-auto flex items-center gap-1 text-sm">
          {/* min-h-11 (44px) เป็นขนาดขั้นต่ำที่กดง่ายด้วยนิ้วบนจอมือถือ ตามมาตรฐาน Apple/Google */}
          <Link
            href="/map"
            className="flex min-h-11 items-center rounded-lg px-3 font-medium transition-colors hover:bg-surface-muted"
          >
            แผนที่
          </Link>
          <Link
            href="/events"
            className="flex min-h-11 items-center rounded-lg px-3 font-medium transition-colors hover:bg-surface-muted"
          >
            ค้นหางาน
          </Link>
          <Link
            href="/submit"
            className="glow-brand flex min-h-11 items-center rounded-lg bg-brand-600 px-3 font-medium text-white transition-colors hover:bg-brand-700"
          >
            แจ้งงาน
          </Link>
        </nav>
      </div>
    </header>
  );
}
