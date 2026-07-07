import type { SelectHTMLAttributes } from 'react'
import { inputBase } from './Input'

export default function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${inputBase} cursor-pointer ${className}`} {...props} />
}
