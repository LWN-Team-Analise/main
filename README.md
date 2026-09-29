# LWN Engenharia Website

A modern, professional React-based website for LWN Engenharia featuring a cinematic 3D scroll-driven hero experience.

## Features

- **Modern Header**: Responsive navigation with social media links
- **Cinematic Hero Section**: 3D scroll-driven transformation between visual states
- **Progressive Text Reveal**: Smooth animations integrated with scroll interaction
- **Responsive Design**: Optimized for desktop, tablet, and mobile devices
- **Professional Aesthetic**: Clean engineering/corporate design language

## Technologies Used

- **React 19**: Modern React with latest features
- **Vite**: Fast build tool and development server
- **GSAP + ScrollTrigger**: Professional animation library for scroll-driven effects
- **Lucide React**: Modern icon library
- **CSS3**: Advanced styling with 3D transforms and animations

## Getting Started

### Prerequisites

- Node.js (18+)
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm run dev
```

3. Open your browser to the local server (typically http://localhost:3000)

### Build for Production

```bash
npm run build
```

### Preview Production Build

```bash
npm run preview
```

## Project Structure

```
main/
├── public/              # Static assets (images, icons)
├── src/
│   ├── components/      # React components
│   │   ├── Header.jsx  # Navigation header
│   │   ├── Header.css
│   │   ├── Hero.jsx    # Cinematic hero section
│   │   └── Hero.css
│   ├── styles/          # Global styles
│   │   └── index.css
│   ├── App.jsx         # Main application component
│   ├── App.css
│   └── main.jsx        # Application entry point
├── index.html          # HTML template
├── vite.config.js      # Vite configuration
└── package.json        # Project dependencies
```

## Components

### Header
- Responsive navigation with mobile hamburger menu
- Social media links (LinkedIn, Instagram, Facebook, YouTube, WhatsApp)
- Smooth scroll behavior
- Sticky positioning with backdrop blur

### Hero
- Full-viewport height (100vh)
- 3D layered scene with parallax effects
- Scroll-driven animation using GSAP ScrollTrigger
- Progressive text reveal with blur effects
- Floating particle elements for depth
- Cinematic camera movement simulation

## Customization

### Adding Hero Images
Replace the placeholder content in `Hero.jsx` with actual images:

```jsx
<div className="hero__image hero__image--initial">
  <img src="/path-to-initial-image.jpg" alt="Initial hero" />
</div>
```

### Adjusting Animation Timing
Modify the GSAP timeline in `Hero.jsx`:

```jsx
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: hero,
    start: 'top top',
    end: '+=2500',  // Adjust scroll distance
    scrub: 1.5,     // Adjust smoothness
  }
});
```

### Customizing Colors
Update CSS variables or direct color values in component CSS files.

## Browser Support

- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Performance

- Optimized 3D transforms using GPU acceleration
- Efficient scroll event handling with GSAP
- Responsive image loading
- Minimal bundle size with Vite optimization

## License

Copyright © 2024 LWN Engenharia. All rights reserved.