import { getFeaturedPendingNewsletter } from "@/lib/newsletter";

type RouteContext = {
  params: Promise<{ slug: string; pendingId: string }>;
};

export async function GET(_request: Request, { params }: RouteContext) {
  const { slug, pendingId: pendingIdRaw } = await params;
  const pendingId = Number(pendingIdRaw);
  if (!Number.isFinite(pendingId) || pendingId <= 0) {
    return new Response("Not found", { status: 404 });
  }

  let data: Awaited<ReturnType<typeof getFeaturedPendingNewsletter>>;
  try {
    data = await getFeaturedPendingNewsletter(pendingId);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  if (data.city_slug && data.city_slug !== slug) {
    return new Response("Not found", { status: 404 });
  }

  return new Response(data.display_html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
