import { UserMenu } from '@/components/UserMenu';

interface TopBarProps {
  title: string;
}

export function TopBar({ title }: TopBarProps) {
  return (
    <header className="topbar" role="banner">
      <h1 className="topbar-title">{title}</h1>
      <UserMenu />
    </header>
  );
}
