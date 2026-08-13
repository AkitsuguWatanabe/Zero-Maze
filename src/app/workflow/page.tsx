import type { Metadata } from "next";
import WorkflowClient from "./WorkflowClient";

export const metadata: Metadata = {
  title: "指示作成フロー — 入力・AI補完・指示文完成・確定",
  description: "作業概要・背景・期限を入力するだけで、AIが不足を補い、指示文を仕上げます。入力からGO確定までの4ステップを体験できます。",
  openGraph: {
    title: "指示作成フロー",
    description: "3つの入力から、AIが指示文を仕上げる4ステップ体験。",
  },
};

export default function WorkflowPage() {
  return <WorkflowClient />;
}
