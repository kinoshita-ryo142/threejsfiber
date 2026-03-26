# Corporate Tech Portfolio - AI Agent Guidelines

## 1. Project Overview
This project is a corporate technology portfolio website. It emphasizes high performance (fast loading) and visual impact to showcase our technical capabilities. The content update frequency is low.

## 2. Tech Stack
- Framework: Astro (Static Site Generation mode)
- UI & Interactivity: React (18+)
- 3D Graphics: Three.js, React Three Fiber (@react-three/fiber), @react-three/drei
- Styling: Tailwind CSS
- Content Management: Astro Content Collections (Markdown/MDX)
- Package Manager: npm (or pnpm/yarn/bun)

## 3. Core Architecture Rules (Islands Architecture)
**CRITICAL:** This project strictly follows the Astro Islands architecture. Do not build a Single Page Application (SPA).

- Astro (`.astro`) for Static Content: Use Astro components for layout, routing, SEO, and static content. Render as much as possible on the server at build time.
- React (`.tsx` or `.jsx`) for Interactive Islands ONLY: Use React strictly for highly interactive components (e.g., Three.js canvas, complex filtering, complex forms).
- No Client-Side Routing: Do not use `react-router`. Use Astro's built-in file-based routing.
- Hydration Directives: When importing a React component into an `.astro` file, ALWAYS use the appropriate client directive (e.g., `client:load`, `client:visible`, `client:idle`).
  - Example: `<ThreeScene client:visible />`

## 4. 3D & Three.js (React Three Fiber) Guidelines
- Isolate 3D components: Keep R3F components cleanly separated from standard UI components.
- Canvas placement: The `<Canvas>` component from `@react-three/fiber` should be the top-level wrapper inside a specific React component island.
- Performance: Be mindful of 3D performance. Use `useMemo` for complex geometries/materials if necessary. Dispose of WebGL resources when not in use.

## 5. Coding Style & Conventions
- TypeScript: Use TypeScript for all components and utilities. Define clear interfaces/types.
- Styling: Use Tailwind CSS utility classes directly in `class` (Astro) or `className` (React). Avoid creating separate CSS/SCSS files unless absolutely necessary for complex global animations.
- Content Collections: Put all portfolio projects and articles inside `src/content/`. Define schemas in `src/content/config.ts` using `zod`.

## 6. Directory Structure
src/
├── components/
│   ├── astro/       # Static Astro components (Header, Footer, Cards)
│   ├── react/       # Standard React UI components (Filters, Forms)
│   └── three/       # React Three Fiber components (Scenes, Models)
├── content/         # Markdown/MDX files for portfolio items
├── layouts/         # Astro layout files
├── pages/           # Astro file-based routing
└── styles/          # Global styles (Tailwind directives)

## 7. AI Agent Behavior Rules
- When asked to create a new page, ALWAYS create an `.astro` file in `src/pages/`.
- When asked to create a 3D visual, create a React component in `src/components/three/` and instruct the user how to import it into an `.astro` file with `client:visible`.
- Do not suggest replacing Astro routing with React routing.
- If you are unsure whether to use Astro or React for a component, default to Astro unless it requires client-side state (`useState`, `useEffect`) or DOM interactions.
- Provide concise, clean, and well-commented code.