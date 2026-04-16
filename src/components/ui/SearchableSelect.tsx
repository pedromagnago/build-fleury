import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, Check } from 'lucide-react'

interface Option {
  value: string
  label: string
}

interface SearchableSelectProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export function SearchableSelect({ options, value, onChange, placeholder = "Selecione...", className = "" }: SearchableSelectProps) {
  const [open, setOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find(o => o.value === value)
  
  const filteredOptions = options.filter(o => 
    o.label.toLowerCase().includes(searchTerm.toLowerCase())
  )

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <div className="relative w-full" ref={dropdownRef}>
      <div 
        onClick={() => setOpen(!open)}
        className={`flex min-h-9 w-full items-center justify-between rounded-md border border-input bg-background/50 px-3 py-1 text-xs shadow-sm transition-colors cursor-pointer hover:bg-background ${className}`}
      >
        <span className={selectedOption ? "text-foreground" : "text-muted-foreground"}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown className="h-3.5 w-3.5 opacity-50" />
      </div>

      {open && (
        <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
          <div className="flex items-center border-b px-3">
            <Search className="mr-2 h-3.5 w-3.5 shrink-0 opacity-50" />
            <input 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex h-9 w-full rounded-md bg-transparent py-3 text-xs outline-none placeholder:text-muted-foreground"
              placeholder="Pesquisar..."
              autoFocus
            />
          </div>
          <div className="p-1">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">Nenhum resultado.</div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.value}
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                    setSearchTerm('')
                  }}
                  className={`relative flex w-full cursor-pointer select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-xs outline-none hover:bg-accent hover:text-accent-foreground ${option.value === value ? 'bg-accent/50 font-medium' : ''}`}
                >
                  {option.label}
                  {option.value === value && (
                    <span className="absolute right-2 flex h-3.5 w-3.5 items-center justify-center">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
