export function AttributionSection() {
  return (
    <div className="pl-6 shadow-sm">


      <div className="mt-8 max-w-2xl">
        <h3 className="text-[24px] font-semibold tracking-tight text-slate-900">
          Attribution Setup Required
        </h3>
        <p className="mt-3 text-sm leading-6 text-slate-500">
          To access this dashboard, our team will help you connect your attribution data. Reach out to support to get
          started.
        </p>

        <div className="mt-6">
          <p className="text-[15px] font-semibold text-slate-800">What you’ll get once enabled</p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm leading-6 text-slate-500">
            <li>Real-time event and revenue insights</li>
            <li>Campaign and source-level performance</li>
            <li>Visual user journey tracking</li>
          </ul>
        </div>

        <button
          type="button"
          className="mt-6 inline-flex h-10 items-center rounded-lg bg-[#334763] px-4 text-sm font-semibold text-white transition hover:bg-[#2B3C54]"
        >
          Request Setup
        </button>
      </div>
    </div>
  );
}

export default AttributionSection;
