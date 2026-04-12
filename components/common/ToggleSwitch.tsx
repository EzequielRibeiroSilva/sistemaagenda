import React from 'react';

type ToggleSwitchProps = {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  disabled?: boolean;
};

const ToggleSwitch: React.FC<ToggleSwitchProps> = ({ enabled, setEnabled, disabled }) => (
  <button
    type="button"
    className={`${enabled ? 'bg-blue-600' : 'bg-gray-200'} relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
    role="switch"
    aria-checked={enabled}
    aria-disabled={disabled}
    onClick={() => {
      if (disabled) return;
      setEnabled(!enabled);
    }}
  >
    <span
      aria-hidden="true"
      className={`${enabled ? 'translate-x-5' : 'translate-x-0'} pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
    />
  </button>
);

export default ToggleSwitch;
