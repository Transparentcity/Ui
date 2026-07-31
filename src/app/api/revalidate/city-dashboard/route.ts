import { revalidatePath, revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

/**
 * Bust ISR/cache for a city's public dashboard after Display Settings change.
 * Called from the admin MetricOrderEditor save/reset flow.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      cityId?: number;
      slug?: string | null;
    };
    const cityId =
      typeof body.cityId === "number" && Number.isFinite(body.cityId)
        ? body.cityId
        : null;
    const slug =
      typeof body.slug === "string" && body.slug.trim()
        ? body.slug.trim()
        : null;

    if (cityId == null && !slug) {
      return NextResponse.json(
        { error: "cityId or slug is required" },
        { status: 400 }
      );
    }

    if (cityId != null) {
      // expire: 0 = immediate invalidation (admin just saved Display Settings)
      revalidateTag(`city-metric-ordering-${cityId}`, { expire: 0 });
    }

    if (slug) {
      // Page + nested district/category routes under this city
      revalidatePath(`/c/${slug}`);
      revalidatePath(`/c/${slug}`, "layout");
    }

    return NextResponse.json({
      revalidated: true,
      cityId,
      slug,
    });
  } catch (error) {
    console.error("[revalidate/city-dashboard]", error);
    return NextResponse.json(
      { error: "Failed to revalidate" },
      { status: 500 }
    );
  }
}
