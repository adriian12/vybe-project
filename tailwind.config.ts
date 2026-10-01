
import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
	darkMode: ["class"],
	content: [
		"./pages/**/*.{ts,tsx}",
		"./components/**/*.{ts,tsx}",
		"./app/**/*.{ts,tsx}",
		"./src/**/*.{ts,tsx}",
	],
	prefix: "",
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				'2xl': '1400px'
			}
		},
		extend: {
			// Sistema de diseño «Balearic Electric», del proyecto de Stitch
			// «Vybes Nightlife App». Outfit para lo que se lee de un vistazo
			// (titulares, títulos de tarjeta, cifras) y Plus Jakarta Sans para
			// todo lo demás.
			fontFamily: {
				sans: ['"Plus Jakarta Sans Variable"', '"Plus Jakarta Sans"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
				display: ['"Outfit Variable"', 'Outfit', 'ui-sans-serif', 'system-ui', 'sans-serif'],
			},
			// La escala de Stitch con sus nombres, para poder copiar una
			// pantalla sin traducir tamaños a ojo.
			fontSize: {
				'headline-xl': ['28px', { lineHeight: '34px', letterSpacing: '-0.02em', fontWeight: '800' }],
				'headline-lg': ['22px', { lineHeight: '28px', letterSpacing: '-0.015em', fontWeight: '800' }],
				'headline-md': ['18px', { lineHeight: '24px', letterSpacing: '-0.01em', fontWeight: '700' }],
				'title-card': ['15px', { lineHeight: '20px', letterSpacing: '-0.005em', fontWeight: '700' }],
				'body-md': ['14px', { lineHeight: '20px', fontWeight: '500' }],
				'body-sm': ['13px', { lineHeight: '18px', fontWeight: '400' }],
				'label-pill': ['11px', { lineHeight: '14px', letterSpacing: '0.02em', fontWeight: '700' }],
				caption: ['11px', { lineHeight: '14px', letterSpacing: '0.01em', fontWeight: '600' }],
			},
			spacing: {
				// Margen lateral de las pantallas móviles.
				margin: '1.25rem',
				gutter: '1rem',
			},
			colors: {
				// Tinta de las tarjetas blancas y del texto sobre amarillo.
				ink: '#111114',
				// Planos de superficie: cada escalón se ve por encima del anterior
				// sin necesidad de borde ni sombra.
				surface: {
					DEFAULT: '#111114',
					low: '#1B1B1E',
					container: '#1F1F22',
					high: '#2A2A2D',
					highest: '#353438',
				},
				border: 'hsl(var(--border))',
				input: 'hsl(var(--input))',
				// Relleno de los campos de formulario; cambia dentro de las
				// tarjetas claras.
				field: {
					DEFAULT: 'hsl(var(--field))',
					border: 'hsl(var(--field-border))',
				},
				ring: 'hsl(var(--ring))',
				background: 'hsl(var(--background))',
				foreground: 'hsl(var(--foreground))',
				primary: {
					DEFAULT: 'hsl(var(--primary))',
					foreground: 'hsl(var(--primary-foreground))'
				},
				secondary: {
					DEFAULT: 'hsl(var(--secondary))',
					foreground: 'hsl(var(--secondary-foreground))'
				},
				destructive: {
					DEFAULT: 'hsl(var(--destructive))',
					foreground: 'hsl(var(--destructive-foreground))'
				},
				muted: {
					DEFAULT: 'hsl(var(--muted))',
					foreground: 'hsl(var(--muted-foreground))'
				},
				accent: {
					DEFAULT: 'hsl(var(--accent))',
					foreground: 'hsl(var(--accent-foreground))'
				},
				popover: {
					DEFAULT: 'hsl(var(--popover))',
					foreground: 'hsl(var(--popover-foreground))'
				},
				card: {
					DEFAULT: 'hsl(var(--card))',
					foreground: 'hsl(var(--card-foreground))'
				},
				sidebar: {
					DEFAULT: 'hsl(var(--sidebar-background))',
					foreground: 'hsl(var(--sidebar-foreground))',
					primary: 'hsl(var(--sidebar-primary))',
					'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
					accent: 'hsl(var(--sidebar-accent))',
					'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
					border: 'hsl(var(--sidebar-border))',
					ring: 'hsl(var(--sidebar-ring))'
				},
				// Colores temáticos de la app.
				//
				// `dark` y `gray` venían de cuando el fondo era más claro. Con el
				// fondo actual (#121832) `dark` quedaba por debajo de él, así que
				// cualquier panel pintado con él desaparecía, y `gray` se quedaba
				// en 4,9:1 de contraste, por debajo de lo exigible para texto
				// pequeño. Ahora `dark` es una superficie *por encima* del fondo y
				// `gray` llega a 7,5:1.
				party: {
					primary: '#F8D000',    // Amarillo de la marca
					secondary: '#FFF3B0',  // Amarillo claro
					accent: '#FFA60A',     // Ámbar, para lo destacado
					dark: '#1C1C1C',       // Superficie sobre el fondo
					light: '#F5F5F5',      // Texto claro
					pink: '#FFDEE2',       // Rosa claro
					// Gris de texto secundario. Va por variable porque dentro de las
					// tarjetas blancas de los paneles tiene que oscurecerse: #A1A1A6
					// sobre blanco se queda en 2,6:1.
					gray: 'rgb(var(--party-gray) / <alpha-value>)',
				}
			},
			borderRadius: {
				lg: 'var(--radius)',
				md: 'calc(var(--radius) - 2px)',
				sm: 'calc(var(--radius) - 4px)'
			},
			keyframes: {
				'accordion-down': {
					from: {
						height: '0'
					},
					to: {
						height: 'var(--radix-accordion-content-height)'
					}
				},
				'accordion-up': {
					from: {
						height: 'var(--radix-accordion-content-height)'
					},
					to: {
						height: '0'
					}
				},
				'slide-right': {
					'0%': { transform: 'translateX(0)' },
					'100%': { transform: 'translateX(100%)' }
				},
				'slide-left': {
					'0%': { transform: 'translateX(0)' },
					'100%': { transform: 'translateX(-100%)' }
				},
				'fade-in': {
					'0%': { opacity: '0' },
					'100%': { opacity: '1' }
				},
				'pulse-soft': {
					'0%, 100%': { opacity: '1' },
					'50%': { opacity: '0.7' }
				},
				// La línea que barre el visor del lector de QR.
				'scan-line': {
					'0%': { transform: 'translateY(0)' },
					'100%': { transform: 'translateY(100%)' }
				}
			},
			animation: {
				'accordion-down': 'accordion-down 0.2s ease-out',
				'accordion-up': 'accordion-up 0.2s ease-out',
				'slide-right': 'slide-right 0.5s ease-out',
				'slide-left': 'slide-left 0.5s ease-out',
				'fade-in': 'fade-in 0.5s ease-out',
				'pulse-soft': 'pulse-soft 2s infinite',
				'scan-line': 'scan-line 2.4s cubic-bezier(0.77, 0, 0.175, 1) infinite alternate'
			}
		}
	},
	plugins: [tailwindcssAnimate],
} satisfies Config;
