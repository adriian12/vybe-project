
import { ButtonHTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "@radix-ui/react-slot"

const buttonVariants = cva(
  // El botón de Stitch: 12 px de radio y 48 px de alto en la acción principal.
  // Antes era una píldora, y al lado de las píldoras de filtro no se distinguía
  // qué era un botón y qué una etiqueta.
  "press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        // Tinta oscura sobre el amarillo: en blanco no se leería.
        default: "bg-party-primary text-ink hover:bg-[#E0BC00] active:bg-[#E0BC00]",
        secondary: "bg-card text-foreground hover:bg-surface-high",
        accent: "bg-party-accent text-ink hover:bg-party-accent/90",
        outline: "border border-party-gray/40 text-foreground hover:bg-white/[0.04]",
        ghost: "text-party-primary hover:bg-party-primary/10",
        gradient: "bg-party-primary text-ink hover:bg-[#E0BC00]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-11 py-2 px-4",
        sm: "h-9 px-3",
        lg: "h-12 px-8 text-base",
        icon: "h-10 w-10",
        round: "h-14 w-14 rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface PartyButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
      asChild?: boolean;
    }

const PartyButton = forwardRef<HTMLButtonElement, PartyButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
PartyButton.displayName = "PartyButton"

export { PartyButton, buttonVariants }
