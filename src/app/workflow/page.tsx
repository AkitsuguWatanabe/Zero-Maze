import type { Metadata } from "next";
import WorkflowClient from "./WorkflowClient";

export const metadata: Metadata = {
  title: "指示作成フロー — 入力・評価・修正・確定",
  description: "指示の入力から品質チェック、修正、GO確定までの4ステップを体験できます。",
  openGraph: {
    title: "指示作成フロー",
    description: "4ステップで指示の質を底上げする体験フロー。",
  },
};

export default function WorkflowPage() {
  return <WorkflowClient />;
}
