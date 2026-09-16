import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

/**
 * `tailwind-merge` con la escala tipográfica de Stitch registrada.
 *
 * Sin esto no sabe que `text-caption` o `text-body-sm` son tamaños de letra:
 * los toma por colores y, cuando van junto a un color como `text-party-gray`,
 * se queda con el último y borra el tamaño. Los textos salían a 16 px.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "headline-xl",
            "headline-lg",
            "headline-md",
            "title-card",
            "body-md",
            "body-sm",
            "label-pill",
            "caption",
          ],
        },
      ],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
