import React from 'react';
import { NavSection } from './Sidebar';
import { LayoutDashboard, Receipt, PiggyBank, FileSpreadsheet, Menu } from 'lucide-react';

interface MobileBottomNavProps {
  currentSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onOpenAllMenu: () => void;
  isSuperAdmin?: boolean;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentSection,
  onSelectSection,
  onOpenAllMenu,
}) => {
  const isAllMenuOpen = currentSection.startsWith('admin-') || currentSection === 'banks';

  const navTabs: { id: NavSection; label: string; icon: any }[] = [
    { id: 'dashboard', label: '대시보드', icon: LayoutDashboard },
    { id: 'transactions', label: '전표관리', icon: Receipt },
    { id: 'budgets', label: '예산관리', icon: PiggyBank },
    { id: 'reports', label: '결산보고', icon: FileSpreadsheet },
  ];

  return (
    <nav
      aria-label="모바일 하단 내비게이션"
      className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-1 py-1 flex items-center justify-around shadow-lg"
      style={{ paddingBottom: 'calc(0.25rem + env(safe-area-inset-bottom, 0px))' }}
    >
      {navTabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = currentSection === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onSelectSection(tab.id)}
            className={`flex flex-col items-center justify-center flex-1 min-h-[48px] py-1 px-1 rounded-xl transition-colors ${
              isActive ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <div className={`relative p-1 rounded-lg ${isActive ? 'bg-indigo-50' : ''}`}>
              <Icon className="w-5 h-5" />
            </div>
            <span className="text-[10px] tracking-tight mt-0.5 leading-tight">{tab.label}</span>
          </button>
        );
      })}

      {/* 전체 메뉴 (Admin & All) Trigger */}
      <button
        onClick={onOpenAllMenu}
        className={`flex flex-col items-center justify-center flex-1 min-h-[48px] py-1 px-1 rounded-xl transition-colors ${
          isAllMenuOpen ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'
        }`}
      >
        <div className={`relative p-1 rounded-lg ${isAllMenuOpen ? 'bg-indigo-50' : ''}`}>
          <Menu className="w-5 h-5" />
        </div>
        <span className="text-[10px] tracking-tight mt-0.5 leading-tight">전체메뉴</span>
      </button>
    </nav>
  );
};
