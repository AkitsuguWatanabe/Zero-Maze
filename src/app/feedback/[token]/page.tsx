import { SiteFooter } from "@/components/SiteHeader";
import { FeedbackClient } from "./FeedbackClient";

export default async function FeedbackPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex flex-1 items-center justify-center px-6 py-20">
        <div className="w-full max-w-md">
          <FeedbackClient token={token} />
        </div>
      </div>
      <SiteFooter />
    </div>
  );
}