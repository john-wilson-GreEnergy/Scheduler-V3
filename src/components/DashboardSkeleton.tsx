import React from 'react';
import { motion } from 'motion/react';

export const DashboardSkeleton = () => {
  return (
    <div className="space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="flex items-center justify-between mb-2">
        <div className="space-y-2">
          <div className="h-8 w-48 bg-white/5 rounded-xl" />
          <div className="h-3 w-32 bg-white/5 rounded-lg" />
        </div>
        <div className="w-12 h-12 rounded-2xl bg-white/5" />
      </div>

      {/* Bento Grid Skeleton */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div className="col-span-2 row-span-2 h-64 bg-white/5 rounded-[32px]" />
        <div className="h-32 bg-white/5 rounded-[32px]" />
        <div className="h-32 bg-white/5 rounded-[32px]" />
        <div className="col-span-2 h-24 bg-white/5 rounded-[32px]" />
        <div className="col-span-2 h-48 bg-white/5 rounded-[32px]" />
        <div className="col-span-2 h-48 bg-white/5 rounded-[32px]" />
      </div>
    </div>
  );
};
