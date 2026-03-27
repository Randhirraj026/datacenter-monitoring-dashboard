export default function BackgroundAnimation() {
  return (
    <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
      {/* Moving grid */}
      <div
        className="absolute w-[200%] h-[200%] top-[-50%] left-[-50%] animate-grid-move"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0,102,255,.03) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0,102,255,.03) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />
      {/* Floating glows */}
      <div
        className="absolute rounded-full opacity-50 animate-float"
        style={{
          width: 500, height: 500,
          background: 'radial-gradient(circle, rgba(0,102,255,.08) 0%, transparent 70%)',
          top: '-10%', right: '-10%',
        }}
      />
      <div
        className="absolute rounded-full opacity-50 animate-float"
        style={{
          width: 400, height: 400,
          background: 'radial-gradient(circle, rgba(0,194,255,.08) 0%, transparent 70%)',
          bottom: '10%', left: '-5%',
          animationDelay: '-5s',
        }}
      />
      <div
        className="absolute rounded-full opacity-50 animate-float"
        style={{
          width: 300, height: 300,
          background: 'radial-gradient(circle, rgba(0,200,83,.06) 0%, transparent 70%)',
          top: '40%', right: '20%',
          animationDelay: '-10s',
        }}
      />
    </div>
  )
}
