import NovaClient from "./NovaClient";

export default async function NovaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ brandSlug?: string; brandName?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  return (
    <NovaClient
      analysisId={id}
      brandSlug={query.brandSlug || ""}
      brandName={query.brandName || ""}
    />
  );
}
