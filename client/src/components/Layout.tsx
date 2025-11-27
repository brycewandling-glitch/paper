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
    { href: '/ticket', label: 'Bets', icon: Ticket },
    { href: '/papermetrics', label: 'Papermetrics', icon: BarChart3 },
    { href: '/rules', label: 'Rules', icon: BookOpen },
    { href: '/admin', label: 'Admin', icon: ShieldCheck },
  ];

  return (
    <div className="min-h-screen bg-background font-sans text-foreground">
      {/* Navbar */}
      <header className="sticky top-0 z-50 w-full border-b bg-white shadow-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-5">
            <img src="/logo.png" alt="Investment Club Logo" className="h-6 w-6 object-contain" />
            <span className="font-heading font-bold text-xl hidden sm:inline-block tracking-tight text-primary">
              Investment Club
            </span>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <Link key={item.href} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-2 px-3 py-2 md:px-4 rounded-md text-sm font-medium transition-all duration-200 cursor-pointer",
                      isActive
                        ? "bg-primary text-white shadow-md"
                        : "text-muted-foreground hover:text-primary hover:bg-secondary"
                    )}
                    title={item.label}
                  >
                    <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                    <span className="hidden md:inline">{item.label}</span>
                  </div>
                </Link>
              );
            })}
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-6 md:py-10 animate-in fade-in duration-500">
        {children}
      </main>

      {/* Footer */}
      <footer className="border-t py-8 mt-auto bg-white">
        <div className="container mx-auto px-4 text-center text-xs text-muted-foreground uppercase tracking-wider">
          Investment Club &copy; {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}
