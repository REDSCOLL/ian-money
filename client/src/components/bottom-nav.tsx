import { useLocation } from "wouter";
import { LayoutDashboard, Camera, Clock, BarChart3, Settings } from "lucide-react";

const navItems = [
  { path: "/", icon: LayoutDashboard, label: "홈" },
  { path: "/history", icon: Clock, label: "내역" },
  { path: "/scan", icon: Camera, label: "촬영" },
  { path: "/report", icon: BarChart3, label: "리포트" },
  { path: "/settings", icon: Settings, label: "설정" },
];

export function BottomNav() {
  const [location, setLocation] = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 bg-card dark:bg-card border-t border-border z-50 safe-area-bottom"
      data-testid="nav-bottom"
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const isActive = location === item.path;
          const isScan = item.path === "/scan";
          return (
            <button
              key={item.path}
              onClick={() => setLocation(item.path)}
              className={`flex flex-col items-center gap-0.5 min-w-0 flex-1 py-1 transition-colors ${
                isScan
                  ? ""
                  : isActive
                    ? "text-primary"
                    : "text-muted-foreground"
              }`}
              data-testid={`nav-${item.label}`}
            >
              {isScan ? (
                <div className="w-12 h-12 -mt-5 rounded-full bg-primary flex items-center justify-center shadow-md">
                  <Camera className="w-5 h-5 text-primary-foreground" />
                </div>
              ) : (
                <item.icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              )}
              <span className={`text-[10px] leading-tight ${isScan ? "mt-0.5" : ""} ${isActive && !isScan ? "font-semibold" : "font-medium"}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
