import React from 'react';

export const CompanyInfoSkeleton: React.FC = () => (
  <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 animate-pulse">
    <div className="text-center mb-12">
      <div className="h-10 w-64 bg-gray-200 rounded-full mx-auto" />
    </div>
    <div className="space-y-12">
      <div className="bg-white rounded-3xl p-10 border border-gray-100 shadow-sm">
        <div className="space-y-4 max-w-3xl mx-auto">
          <div className="h-6 w-48 bg-gray-200 rounded-full mx-auto" />
          <div className="h-4 w-full bg-gray-100 rounded-full" />
          <div className="h-4 w-5/6 bg-gray-100 rounded-full mx-auto" />
          <div className="h-4 w-2/3 bg-gray-100 rounded-full mx-auto" />
          <div className="h-4 w-3/5 bg-gray-100 rounded-full mx-auto" />
        </div>
      </div>
      <div>
        <div className="text-center mb-8">
          <div className="h-8 w-48 bg-gray-200 rounded-full mx-auto mb-2" />
          <div className="h-4 w-32 bg-gray-100 rounded-full mx-auto" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, idx) => (
            <div
              key={idx}
              className="bg-white rounded-2xl p-5 border border-gray-100"
            >
              <div className="h-5 w-3/4 bg-gray-200 rounded-full mb-4" />
              <div className="space-y-2">
                <div className="h-3 w-2/3 bg-gray-100 rounded-full" />
                <div className="h-3 w-1/2 bg-gray-100 rounded-full" />
                <div className="h-3 w-1/3 bg-gray-100 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  </div>
);


