"use client";

import { useState } from "react";

export function ContactForm() {
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const form = e.currentTarget;
    const data = new FormData(form);
    const payload = {
      name: String(data.get("name") ?? ""),
      company: String(data.get("company") ?? ""),
      email: String(data.get("email") ?? ""),
      phone: String(data.get("phone") ?? ""),
      message: String(data.get("message") ?? ""),
      website: String(data.get("website") ?? ""), // honeypot
    };

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) throw new Error(d.error ?? "送信に失敗しました");
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-sm border border-border bg-card p-8 text-center shadow-paper">
        <p className="font-serif text-lg font-semibold">お問い合わせありがとうございます</p>
        <p className="mt-2 text-sm text-muted-foreground">
          内容を確認の上、担当者よりご連絡いたします。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-sm border border-border bg-card p-8 shadow-paper">
      {/* honeypot — 人間には見えない */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />

      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="お名前" name="name" required />
        <Field label="会社名" name="company" />
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="メールアドレス" name="email" type="email" required />
        <Field label="電話番号" name="phone" type="tel" />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-medium text-foreground">
          お問い合わせ内容 <span className="text-destructive">*</span>
        </label>
        <textarea
          name="message"
          required
          rows={5}
          className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none"
        />
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-sm bg-foreground px-6 py-3 text-sm font-medium text-background hover:opacity-90 disabled:opacity-40 sm:w-auto"
      >
        {submitting ? (
          <>
            <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-background/30 border-t-background" />
            送信中…
          </>
        ) : "送信する"}
      </button>
    </form>
  );
}

function Field({
  label, name, type = "text", required = false,
}: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-foreground">
        {label} {required && <span className="text-destructive">*</span>}
      </label>
      <input
        name={name}
        type={type}
        required={required}
        className="w-full rounded-sm border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-foreground focus:outline-none"
      />
    </div>
  );
}
