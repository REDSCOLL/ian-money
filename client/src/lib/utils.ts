import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { CATEGORIES } from "@shared/schema";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("ko-KR").format(amount) + "원";
}

export function formatDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

export function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

export function getCategoryLabel(value: string): string {
  return CATEGORIES.find((c) => c.value === value)?.label || "기타";
}

export function getCategoryColor(value: string): string {
  const colors: Record<string, string> = {
    food: "hsl(168, 60%, 38%)",
    transport: "hsl(200, 65%, 42%)",
    shopping: "hsl(280, 45%, 55%)",
    entertainment: "hsl(35, 80%, 52%)",
    medical: "hsl(340, 55%, 52%)",
    education: "hsl(220, 55%, 50%)",
    utilities: "hsl(45, 70%, 50%)",
    cafe: "hsl(25, 60%, 48%)",
    etc: "hsl(210, 15%, 55%)",
  };
  return colors[value] || colors.etc;
}

export function getCurrentMonth(): { month: number; year: number } {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}
