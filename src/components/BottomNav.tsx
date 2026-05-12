import { useLocation, useNavigate } from "react-router-dom";
import { CalendarDays, Music, Home, MessageCircle, User } from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { title: "Cultos", href: "/app/cultos", icon: CalendarDays },
  { title: "Repertório", href: "/app/repertorios", icon: Music },
  { title: "Início", href: "/app/home", icon: Home, center: true },
  { title: "Chat", href: "/app/chat", icon: MessageCircle },
  { title: "Usuário", href: "/app/settings", icon: User },
];

export function BottomNav() {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden">
      <div className="relative flex items-end justify-around px-2 pb-2 pt-1">
        {/* Background bar */}
        <div className="absolute bottom-0 left-0 right-0 h-16 glass-sidebar rounded-t-2xl" />

        {navItems.map((item) => {
          const isActive = location.pathname.startsWith(item.href);

          if (item.center) {
            return (
              <button
                key={item.href}
                onClick={() => navigate(item.href)}
                className="relative z-10 -mt-4 flex flex-col items-center"
              >
                <div
                  className={cn(
                    "h-14 w-14 rounded-full flex items-center justify-center shadow-lg transition-all duration-200",
                    "bg-primary text-primary-foreground",
                    isActive && "ring-4 ring-primary/20 scale-105"
                  )}
                >
                  <item.icon className="h-6 w-6" />
                </div>
                <span className="text-[10px] font-medium mt-1 text-foreground">
                  {item.title}
                </span>
              </button>
            );
          }

          return (
            <button
              key={item.href}
              onClick={() => navigate(item.href)}
              className="relative z-10 flex flex-col items-center pt-2 pb-1 px-3"
            >
              <item.icon
                className={cn(
                  "h-5 w-5 transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground"
                )}
              />
              <span
                className={cn(
                  "text-[10px] mt-1 transition-colors",
                  isActive ? "font-semibold text-foreground" : "font-medium text-muted-foreground"
                )}
              >
                {item.title}
              </span>
              {isActive && (
                <div className="absolute bottom-0 h-1 w-1 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
