import React from 'react';

interface BrandMarkProps {
  className?: string;
}

/**
 * Sekiz köşeli Selçuklu yıldızı ve açık mushaf sayfalarından esinlenen özgün Muallimun amblemi.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ className = 'w-9 h-9' }) => {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect width="40" height="40" rx="11" fill="#0F766E" />
      <path
        d="M20 5.5L23.8 11.2L30.5 9.5L28.8 16.2L34.5 20L28.8 23.8L30.5 30.5L23.8 28.8L20 34.5L16.2 28.8L9.5 30.5L11.2 23.8L5.5 20L11.2 16.2L9.5 9.5L16.2 11.2L20 5.5Z"
        stroke="#F59E0B"
        strokeOpacity="0.45"
        strokeWidth="1.25"
      />
      <path
        d="M12.5 15.2C14.8 14.3 17.5 14.7 20 16.4C22.5 14.7 25.2 14.3 27.5 15.2V26.2C25.2 25.3 22.5 25.7 20 27.4C17.5 25.7 14.8 25.3 12.5 26.2V15.2Z"
        fill="#FFFFFF"
        fillOpacity="0.96"
      />
      <path
        d="M20 16.4V27.4"
        stroke="#0F766E"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="20" cy="11.2" r="1.6" fill="#FBBF24" />
    </svg>
  );
};
