'use client'

import React, { createContext, useContext, useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

interface SidebarContextType {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
  close: () => void
}

const SidebarContext = createContext<SidebarContextType>({
  open: false,
  setOpen: () => {},
  toggle: () => {},
  close: () => {},
})

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Tutup sidebar otomatis bila pengguna berpindah halaman
  useEffect(() => {
    setOpen(false)
  }, [pathname])

  // Kunci scroll halaman saat sidebar mobile terbuka
  useEffect(() => {
    if (open) {
      document.body.classList.add('rail-lock')
    } else {
      document.body.classList.remove('rail-lock')
    }
    return () => {
      document.body.classList.remove('rail-lock')
    }
  }, [open])

  return (
    <SidebarContext.Provider
      value={{
        open,
        setOpen,
        toggle: () => setOpen((prev) => !prev),
        close: () => setOpen(false),
      }}
    >
      {children}
    </SidebarContext.Provider>
  )
}

export function useSidebar() {
  return useContext(SidebarContext)
}
