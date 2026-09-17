import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    fontSize: {
      xs: ["0.75rem", { lineHeight: "1.35" }],
      sm: ["0.875rem", { lineHeight: "1.5" }],
      base: ["0.875rem", { lineHeight: "1.5" }],
      lg: ["1.25rem", { lineHeight: "1.3" }],
      xl: ["1.25rem", { lineHeight: "1.3" }],
      "2xl": ["1.25rem", { lineHeight: "1.3" }],
      "3xl": ["1.25rem", { lineHeight: "1.3" }],
      "4xl": ["1.25rem", { lineHeight: "1.3" }],
      "5xl": ["1.25rem", { lineHeight: "1.3" }],
      "6xl": ["1.25rem", { lineHeight: "1.3" }],
      "7xl": ["1.25rem", { lineHeight: "1.3" }],
      "8xl": ["1.25rem", { lineHeight: "1.3" }],
      "9xl": ["1.25rem", { lineHeight: "1.3" }],
    },
    extend: {
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
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          border: "hsl(var(--sidebar-border))",
          accent: "hsl(var(--sidebar-accent))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ["Times New Roman", "Times", "serif"],
        display: ["Times New Roman", "Times", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
