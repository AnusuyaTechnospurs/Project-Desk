import Workspace from "@/components/workspace";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <Workspace view="detail" projectId={(await params).id} />;
}
