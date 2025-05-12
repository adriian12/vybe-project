
import { ButtonHTMLAttributes, forwardRef } from "react"
import { cn } from "@/lib/utils"
import { cva, type VariantProps } from "class-variance-authority"

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-full text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      variant: {
        default: "bg-party-primary text-white hover:bg-party-primary/90",
        secondary: "bg-party-secondary text-party-primary hover:bg-party-secondary/80",
        accent: "bg-party-accent text-white hover:bg-party-accent/90",
        outline: "border border-party-primary text-party-primary hover:bg-party-primary/10",
        ghost: "text-party-primary hover:bg-party-primary/10",
        gradient: "party-gradient text-white hover:opacity-90",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
      },
      size: {
        default: "h-10 py-2 px-4",
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
    VariantProps<typeof buttonVariants> {}

const PartyButton = forwardRef<HTMLButtonElement, PartyButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
PartyButton.displayName = "PartyButton"

export { PartyButton, buttonVariants }
