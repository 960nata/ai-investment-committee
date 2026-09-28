/**
 * Kredit pembuat, satu sumber untuk semua footer supaya teks dan tautannya
 * tidak pernah berbeda antarhalaman.
 */
export function MadeBy({ className }: { className?: string }) {
  return (
    <span className={className ? `made-by ${className}` : 'made-by'}>
      Dibuat oleh{' '}
      <a href="https://hadinata.dev" target="_blank" rel="noopener">
        hadinata.dev
      </a>
    </span>
  )
}
