import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          // Relleno #1C1C1C con 12 px de radio; al enfocar, un borde amarillo
          // nítido de 1,5 px y ningún halo.
          "flex h-12 w-full rounded-xl border-[1.5px] border-field-border bg-field px-4 py-2 text-base font-medium text-foreground transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:font-normal placeholder:text-party-gray focus-visible:border-party-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
