import React from 'react';
import { AiOutlineLoading3Quarters } from 'react-icons/ai';

const Loading: React.FC = () => {
  return (
    <div className="flex justify-center items-center h-full">
      <AiOutlineLoading3Quarters className="animate-spin text-4xl text-primary" />
      <span className="ml-2 text-primary">Loading...</span>
    </div>
  );
};

export default Loading;
