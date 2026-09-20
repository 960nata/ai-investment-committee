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
  const [prevPathname, setPrevPathname] = useState(pathname)

  // Tutup sidebar otomatis bila pengguna berpindah halaman
  if (prevPathname !== pathname) {
    setPrevPathname(pathname)
    setOpen(false)
  }

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

  // Dukungan gesture slide / swipe di layar sentuh mobile
  useEffect(() => {
    let startX = 0
    let startY = 0
    let isTracking = false

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      if (!touch) return
      startX = touch.clientX
      startY = touch.clientY

      // Jika sidebar sedang tertutup, lacak sentuhan yang dimulai dekat tepi kiri (< 45px)
      if (!open && startX < 45) {
        isTracking = true
      } else if (open) {
        // Jika sidebar terbuka, lacak sentuhan di mana pun untuk swipe kiri (tutup)
        isTracking = true
      } else {
        isTracking = false
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      if (!isTracking) return
      isTracking = false

      const touch = e.changedTouches[0]
      if (!touch) return
      const deltaX = touch.clientX - startX
      const deltaY = touch.clientY - startY

      // Abaikan bila pergerakan vertikal lebih dominan daripada horizontal
      if (Math.abs(deltaY) > Math.abs(deltaX)) return

      // Swipe ke kanan saat di tepi kiri -> buka sidebar
      if (!open && deltaX > 40 && startX < 45) {
        setOpen(true)
      }
      // Swipe ke kiri saat sidebar terbuka -> tutup sidebar
      else if (open && deltaX < -40) {
        setOpen(false)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchend', onTouchEnd)
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
