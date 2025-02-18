import React from 'react';
import { ClearanceLevel } from '../types';

interface SecurityBannerProps {
  clearanceLevel?: ClearanceLevel;
  classification?: ClearanceLevel;
}

const SecurityBanner: React.FC<SecurityBannerProps> = ({ 
  clearanceLevel, 
  classification 
}) => {
  const getBannerColor = (level?: ClearanceLevel) => {
    switch (level) {
      case 'COSMIC TOP SECRET':
        return 'bg-red-700';
      case 'NATO SECRET':
        return 'bg-orange-600';
      case 'NATO CONFIDENTIAL':
        return 'bg-yellow-600';
      case 'NATO RESTRICTED':
        return 'bg-green-700';
      default:
        return 'bg-blue-600';
    }
  };

  return (
    <div className={`${getBannerColor(classification)} text-white py-2 px-4 text-center font-bold`}>
      {classification || 'UNCLASSIFIED'}
      {clearanceLevel && (
        <span className="ml-4 text-sm">
          User Clearance: {clearanceLevel}
        </span>
      )}
    </div>
  );
};

export default SecurityBanner; 