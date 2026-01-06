import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { Menu, X, Trophy, PlusCircle, Ticket, BarChart3, BookOpen, ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [location] = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const navItems = [
    { href: '/', label: 'Standings', icon: Trophy },
    { href: '/picks', label: 'Picks', icon: PlusCircle },
    { href: '/bets', label: 'Bets', icon: Ticket },
    { href: '/papermetrics', label: 'Papermetrics', icon: BarChart3 },
    { href: '/rules', label: 'Rules', icon: BookOpen },
  ];

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
        <div className="w-full px-4 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-2 sm:gap-5 flex-shrink-0">
            <img src="/logo.png" alt="Investment Club Logo" className="h-5 w-5 sm:h-6 sm:w-6 object-contain" />
            <span className="font-heading font-bold text-lg sm:text-xl hidden md:inline-block tracking-tight text-primary">
              Investment Club
            </span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-2 sm:gap-1 ml-4">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center justify-center gap-1 lg:gap-2 px-3 py-2.5 sm:px-3 sm:py-2 lg:px-4 rounded-md text-xs sm:text-sm font-medium transition-all duration-200 cursor-pointer min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0",
                      isActive
                        ? "bg-primary text-white shadow-md"
                        : "text-muted-foreground hover:text-primary hover:bg-secondary"
                    )}
                    title={item.label}
                  >
                    <Icon size={20} className="sm:w-[18px] sm:h-[18px]" strokeWidth={isActive ? 2.5 : 2} />
                    <span className="hidden lg:inline">{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-4 sm:py-6 md:py-10 animate-in fade-in duration-500">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t py-6 sm:py-8 mt-auto bg-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 text-center text-xs text-muted-foreground uppercase tracking-wider">
          Investment Club &copy; {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}
