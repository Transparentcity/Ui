"use client"

import Link from "next/link"

export function ReadinessContent({
  backHref,
  backLabel,
}: {
  backHref: string
  backLabel: string
}) {
  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <Link href={backHref} className="text-sm text-gray-500 hover:text-gray-700 mb-6 inline-block">
        ← {backLabel}
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">FOIA Readiness</h1>
      <p className="text-gray-600">Readiness assessment coming soon.</p>
    </div>
  )
}
