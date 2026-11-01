import type { ComponentType, ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
}: {
  icon: ComponentType;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card empty-state">
      <Icon />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
