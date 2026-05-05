import React from 'react';

interface ErrorProps {
  message: string;
}

const ErrorDisplay: React.FC<ErrorProps> = ({ message }) => {
  return (
    <div className="text-red-500 text-center p-4">
      <p>Error: {message}</p>
    </div>
  );
};

export default ErrorDisplay;
