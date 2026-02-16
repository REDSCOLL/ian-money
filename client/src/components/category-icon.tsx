import {
  UtensilsCrossed,
  Car,
  ShoppingBag,
  Gamepad2,
  Heart,
  GraduationCap,
  Zap,
  Coffee,
  MoreHorizontal,
} from "lucide-react";

const iconMap: Record<string, typeof UtensilsCrossed> = {
  food: UtensilsCrossed,
  transport: Car,
  shopping: ShoppingBag,
  entertainment: Gamepad2,
  medical: Heart,
  education: GraduationCap,
  utilities: Zap,
  cafe: Coffee,
  etc: MoreHorizontal,
};

const bgColorMap: Record<string, string> = {
  food: "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400",
  transport: "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400",
  shopping: "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400",
  entertainment: "bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400",
  medical: "bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400",
  education: "bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400",
  utilities: "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400",
  cafe: "bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400",
  etc: "bg-gray-100 dark:bg-gray-800/30 text-gray-500 dark:text-gray-400",
};

interface CategoryIconProps {
  category: string;
  size?: "sm" | "md" | "lg";
}

export function CategoryIcon({ category, size = "md" }: CategoryIconProps) {
  const Icon = iconMap[category] || MoreHorizontal;
  const sizeClasses = {
    sm: "w-7 h-7",
    md: "w-9 h-9",
    lg: "w-11 h-11",
  };
  const iconSizes = {
    sm: "w-3.5 h-3.5",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };
  return (
    <div
      className={`${sizeClasses[size]} rounded-md flex items-center justify-center ${bgColorMap[category] || bgColorMap.etc}`}
      data-testid={`icon-category-${category}`}
    >
      <Icon className={iconSizes[size]} />
    </div>
  );
}
