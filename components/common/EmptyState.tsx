import React from 'react';

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

const EmptyState: React.FC<EmptyStateProps> = ({ title, description, icon, action }) => {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      {icon ? <div className="mb-4 text-gray-400">{icon}</div> : null}
      <div className="text-sm font-semibold text-gray-800">{title}</div>
      {description ? <div className="mt-1 text-sm text-gray-500 max-w-md">{description}</div> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
};

export default EmptyState;
