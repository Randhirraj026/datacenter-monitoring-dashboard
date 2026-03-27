const variants = {
  success: 'bg-green-100 text-green-700 border border-green-300',
  warning: 'bg-orange-100 text-orange-700 border border-orange-300',
  danger:  'bg-red-100 text-red-600 border border-red-300',
  info:    'bg-blue-100 text-blue-700 border border-blue-300',
  default: 'bg-gray-100 text-gray-600 border border-gray-300',
}

export default function Badge({ variant = 'default', children, className = '' }) {
  return (
    <span className={`inline-block px-3 py-0.5 rounded-full text-xs font-semibold ${variants[variant]} ${className}`}>
      {children}
    </span>
  )
}

// Helper: derive variant from value vs thresholds
export function getBadgeVariant(val, warnT, dangerT) {
  if (val >= dangerT) return 'danger'
  if (val >= warnT)   return 'warning'
  return 'success'
}
