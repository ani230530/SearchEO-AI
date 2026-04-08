export function IntegrationSkeleton() {
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
      <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gray-200 rounded-xl" />
            <div className="space-y-2">
              <div className="h-5 w-32 bg-gray-200 rounded-full" />
              <div className="h-4 w-48 bg-gray-100 rounded-full" />
            </div>
          </div>
          <div className="h-4 w-20 bg-gray-100 rounded-full" />
        </div>
        <div className="h-4 w-40 bg-gray-100 rounded-full mt-6" />
      </div>
      <div className="bg-white rounded-3xl p-8 border border-gray-100 shadow-sm">
        <div className="h-5 w-36 bg-gray-200 rounded-full mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div key={idx} className="p-4 rounded-2xl border border-gray-100">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-4 w-48 bg-gray-200 rounded-full" />
                  <div className="h-3 w-32 bg-gray-100 rounded-full" />
                </div>
                <div className="w-8 h-8 bg-gray-100 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
