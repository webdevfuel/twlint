import { cn } from '@/lib/utils'

export function TestComponent() {
  return (
    <div className="flex items-center">
      <button className={cn(
        "bg-primary text-white",
        "hover:bg-invalid-hover",
        "focus:ring-fake-ring"
      )}>
        Click me
      </button>
    </div>
  )
}