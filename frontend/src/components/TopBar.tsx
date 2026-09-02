import { UserMenu } from '@/components/UserMenu';
import { ConnectionSwitcher } from '@/components/ConnectionSwitcher';

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  return (
    <header className="topbar" role="banner">
      <h1 className="topbar-title">{title}</h1>
      <div className="flex items-center space-x-3">
        <ConnectionSwitcher />
        <div className="h-5 w-[1px] bg-[#252a3a]" />
        <UserMenu />
      </div>
    </header>
  );
}
