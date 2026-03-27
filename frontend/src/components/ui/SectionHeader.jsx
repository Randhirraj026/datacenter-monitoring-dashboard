export default function SectionHeader({ icon, title }) {
  return (
    <div className="flex items-center gap-4 mb-6 pb-4 border-b-2 border-gray-200">
      <div
        className="w-11 h-11 flex items-center justify-center rounded-xl text-xl"
        style={{
          background: 'linear-gradient(135deg, #0066ff 0%, #3d8bff 100%)',
          boxShadow: '0 10px 40px -10px rgba(0,102,255,.3)',
        }}
      >
        {icon}
      </div>
      <h2 className="text-2xl font-bold text-gray-800">{title}</h2>
    </div>
  )
}
