import NovaClient from "./NovaClient";

export default async function NovaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <NovaClient analysisId={id} />;
}