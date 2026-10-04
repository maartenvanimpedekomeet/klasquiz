import { type HTMLAttributes, type ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function Card({ children, className = '', ...props }: CardProps) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm ${className}`} {...props}>
      {children}
    </div>
  )
}
