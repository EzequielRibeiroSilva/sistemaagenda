import React from 'react';

interface FormSectionProps {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

const FormSection: React.FC<FormSectionProps> = ({ title, children, actions, className }) => {
  return (
    <div className={`bg-white p-6 rounded-lg border border-gray-200 ${className || ''}`.trim()}>
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-lg font-semibold text-blue-600">{title}</h3>
        {actions ? <div className="flex items-center gap-4">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
};

export default FormSection;
