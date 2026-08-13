import type { Metadata } from "next";
import WorkflowClient from "./WorkflowClient";

export const metadata: Metadata = {
  title: "指示作成フロー — AIが指示文を仕上げるまで",
  description: "作業概要・背景・期限を入力するだけで、AIが不足を補い、伝わる指示文に仕上げます。内容を確認し、そのまま担当者に共有できます。",
  openGraph: {
    title: "指示作成フロー",
    description: "3つの入力から、AIが伝わる指示文を仕上げる。",
  },
};

export default function WorkflowPage() {
  return <WorkflowClient />;
}
