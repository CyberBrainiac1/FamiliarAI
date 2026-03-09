# Familiar - Caregiver Dashboard

A caregiver dashboard for tracking people recently seen by a dementia support camera system.

## Project Overview

This is a UI-only implementation of the Familiar dashboard for the hackathon MVP. It includes:

- Landing page
- Sign In page
- Dashboard with Home, Alerts, and People sections
- Person detail views

## Design System

Based on the minimalistic design specified in the requirements:
- Light green primary color (#86efac - Tailwind green-300)
- White background
- Light gray secondary background
- Simple, clean UI with rounded cards and soft shadows

## Folder Structure

```
src/
├── components/
│   ├── ui/          # Reusable UI components
│   └── layout/      # Layout components
├── pages/           # Page components
├── mock/            # Mock data
├── App.tsx          # Main app component
└── main.tsx         # Entry point
```

## Development

To run the project locally:

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open your browser to http://localhost:5173

## Components

Reusable components:
- Button
- Card
- Navbar
- PersonCard
- InteractionItem
- AlertCard

## Pages

1. Landing Page
2. Sign In Page
3. Home Dashboard
4. Unknown Person Review
5. Recent Interactions
6. People Directory
7. Person Detail

## Mock Data

During UI development, fake data is used to simulate backend responses.

## Raspberry Pi Side

The `raspberry-pi/` folder contains the Pi-side face detection and Supabase ingestion pipeline.
See [`raspberry-pi/README.md`](raspberry-pi/README.md) for setup and run instructions.