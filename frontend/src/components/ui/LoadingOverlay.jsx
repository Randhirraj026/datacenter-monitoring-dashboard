export default function LoadingOverlay({ visible }) {
  return (
    <div
      className={`fixed inset-0 bg-white flex flex-col items-center justify-center z-[9999] transition-opacity duration-500 ${
        visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div className="flex gap-3 mb-6">
        {[0, 0.2, 0.4].map((delay, i) => (
          <div
            key={i}
            className="w-4 h-4 rounded-full animate-loader"
            style={{ backgroundColor: '#0066ff', animationDelay: `${delay}s` }}
          />
        ))}
      </div>
      <div className="text-sm font-bold tracking-[4px] text-gray-500 uppercase">
        Connecting to DNN Lab
      </div>
    </div>
  )
}
