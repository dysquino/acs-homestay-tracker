import { GateForm } from "./gate-form";

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const { from } = await searchParams;
  return <GateForm from={from ?? "/"} />;
}
