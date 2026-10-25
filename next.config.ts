import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'export', // Tells Next.js to generate static HTML/CSS/JS
  images: {
    unoptimized: true, // Required because GitHub Pages doesn't support Next.js default image optimization
  },
  // Replace 'your-repository-name' with the exact name of your GitHub repo
  basePath: '/your-repository-name', 
};

export default nextConfig;
