'use client';

import { ToastProvider } from "@/components/Toast";
import Calendar from "@/components/Calendar";

export default function Home() {
  return (
    <ToastProvider>
      <main>
        <Calendar />
      </main>
    </ToastProvider>
  );
}
