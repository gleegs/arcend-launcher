import { useEffect, useRef, useState, type ReactNode } from 'react'
import { clsx } from 'clsx'

export interface MenuItem {
  label: string
  onClick: () => void
  icon?: ReactNode
  danger?: boolean
  keepOpenOnClick?: boolean
}

interface DropdownMenuProps {
  trigger: ReactNode
  items: MenuItem[]
  align?: 'left' | 'right'
  className?: string
  onClose?: () => void
}

export default function DropdownMenu({
  trigger,
  items,
  align = 'right',
  className,
  onClose,
}: DropdownMenuProps) {
  const [isOpen, setIsOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const wasOpenRef = useRef(false)

  useEffect(() => {
    if (wasOpenRef.current && !isOpen) {
      onClose?.()
    }
    wasOpenRef.current = isOpen
  }, [isOpen, onClose])

  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false)
      }
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isOpen])

  const handleItemClick = (item: MenuItem) => {
    item.onClick()
    if (!item.keepOpenOnClick) {
      setIsOpen(false)
    }
  }

  return (
    <div ref={containerRef} className="relative inline-flex">
      <div
        onClick={(e) => {
          e.stopPropagation()
          setIsOpen((v) => !v)
        }}
        className="flex items-center justify-center"
      >
        {trigger}
      </div>

      <div
        className={clsx(
          'absolute bottom-full mb-2 z-50 min-w-44 bg-black border border-border rounded-xl overflow-hidden shadow-button',
          'transition-all duration-200 ease-out',
          align === 'right' ? 'right-0 origin-bottom-right' : 'left-0 origin-bottom-left',
          isOpen
            ? 'opacity-100 translate-y-0 scale-100'
            : 'pointer-events-none opacity-0 translate-y-1 scale-95',
          className
        )}
        style={{ WebkitAppRegion: 'no-drag' }}
      >
        {items.map((item) => (
          <button
            key={item.label}
            onClick={() => handleItemClick(item)}
            className={clsx(
              'w-full flex items-center gap-2 px-4 py-2.5 text-sm uppercase font-bold text-left whitespace-nowrap transition-colors duration-150 cursor-pointer',
              item.danger ? 'text-white hover:bg-[#dc2626]' : 'text-white hover:bg-white/10'
            )}
          >
            {item.icon}
            {item.label}
          </button>
        ))}
      </div>
    </div>
  )
}
