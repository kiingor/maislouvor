import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        // Fonte do sistema: SF Pro (iOS/macOS), Roboto (Android). HIG > Typography.
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Text"', 'system-ui', '"Segoe UI"', 'Roboto', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      // Estilos Dynamic Type (tamanho "Large", padrão) — HIG > Typography > Specifications.
      fontSize: {
        "large-title": ["34px", { lineHeight: "41px", letterSpacing: "0.40px", fontWeight: "700" }],
        title1: ["28px", { lineHeight: "34px", letterSpacing: "0.38px", fontWeight: "700" }],
        title2: ["22px", { lineHeight: "28px", letterSpacing: "-0.26px", fontWeight: "700" }],
        title3: ["20px", { lineHeight: "25px", letterSpacing: "-0.45px", fontWeight: "600" }],
        headline: ["17px", { lineHeight: "22px", letterSpacing: "-0.43px", fontWeight: "600" }],
        body: ["17px", { lineHeight: "22px", letterSpacing: "-0.43px" }],
        callout: ["16px", { lineHeight: "21px", letterSpacing: "-0.31px" }],
        subhead: ["15px", { lineHeight: "20px", letterSpacing: "-0.23px" }],
        footnote: ["13px", { lineHeight: "18px", letterSpacing: "-0.08px" }],
        caption1: ["12px", { lineHeight: "16px", letterSpacing: "0px" }],
        caption2: ["11px", { lineHeight: "13px", letterSpacing: "0.06px" }],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        prominent: {
          DEFAULT: "hsl(var(--prominent))",
          foreground: "hsl(var(--prominent-foreground))",
        },
        grouped: {
          tertiary: "hsl(var(--grouped-tertiary))",
        },
        label: {
          tertiary: "hsl(var(--label-tertiary))",
        },
        separator: "hsl(var(--border))",
        fill: {
          DEFAULT: "var(--fill-primary)",
          secondary: "var(--fill-secondary)",
          tertiary: "var(--fill-tertiary)",
          quaternary: "var(--fill-quaternary)",
        },
        ios: {
          red: "hsl(var(--ios-red))",
          green: "hsl(var(--ios-green))",
          orange: "hsl(var(--ios-orange))",
          yellow: "hsl(var(--ios-yellow))",
          blue: "hsl(var(--ios-blue))",
          gray: "hsl(var(--ios-gray))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        card: "24px",
        sheet: "38px",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
