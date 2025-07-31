# ShaderToy Audio-Video Recorder

Enhanced Chrome extension for recording ShaderToy canvas with audio capture functionality. This extension has been migrated from vanilla JavaScript to TypeScript + React for better maintainability and type safety.

## Features

- 🎥 Record ShaderToy canvas rendering as high-quality video
- 🎵 Capture browser audio (music that influences shaders)
- 🎬 Combine audio and video into single MP4 file
- ⚡ Built with modern tech stack: TypeScript + React + Vite + CRXJS
- 🛡️ Graceful degradation: continues with video-only if audio fails
- 📊 Real-time audio visualization and recording status
- 🎯 Optimized production builds with source maps for debugging

## Requirements

- **Chrome Version**: 116+ (required for offscreen document audio capture)
- **Node.js**: 18+ or 20+ (for development)
- **Permissions**: scripting, activeTab, tabCapture, offscreen

## Development Setup

### Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18 or higher ([Download here](https://nodejs.org/))
- **npm**: Comes with Node.js (or use yarn/pnpm if preferred)
- **Chrome Browser**: Version 116 or higher
- **Git**: For version control

### Installation

1. **Clone the repository**:

   ```bash
   git clone <repository-url>
   cd shadertoy-audio-recorder
   ```

2. **Install dependencies**:

   ```bash
   npm install
   ```

3. **Verify installation**:
   ```bash
   npm run type-check
   ```

### Development Commands

```bash
# Start development server with hot reload
npm run dev

# Type checking (recommended to run frequently)
npm run type-check

# Build for development (with source maps)
npm run build:dev

# Build for production (optimized)
npm run build:prod

# Build with type checking (safer production build)
npm run build:prod:safe

# Run tests
npm run test

# Run tests once (for CI)
npm run test:run

# Validate production build
npm run validate:build

# Clean build artifacts
npm run clean
```

### Loading the Extension in Chrome

#### For Development:

1. **Build the extension**:

   ```bash
   npm run build:dev
   ```

2. **Open Chrome Extensions page**:

   - Navigate to `chrome://extensions/`
   - Or use menu: More Tools → Extensions

3. **Enable Developer Mode**:

   - Toggle the "Developer mode" switch in the top right

4. **Load the extension**:

   - Click "Load unpacked"
   - Select the `dist` folder from your project directory

5. **Verify installation**:
   - The extension should appear in your extensions list
   - Pin it to the toolbar for easy access

#### For Production Testing:

1. **Build optimized version**:

   ```bash
   npm run build:prod
   ```

2. **Validate the build**:

   ```bash
   npm run validate:build
   ```

3. **Load as above** using the `dist` folder

### Development Workflow

1. **Start development server**:

   ```bash
   npm run dev
   ```

2. **Make changes** to your code

3. **The extension will auto-reload** in development mode

4. **Test your changes** on ShaderToy pages

5. **Run type checking** before committing:

   ```bash
   npm run type-check
   ```

6. **Run tests**:
   ```bash
   npm run test:run
   ```

## Project Structure

```
shadertoy-audio-recorder/
├── src/
│   ├── background/              # Service worker (background script)
│   │   ├── background.ts        # Main background service worker
│   │   └── __tests__/           # Background script tests
│   ├── content/                 # Content scripts (injected into pages)
│   │   ├── content.ts           # ShaderToy page content script
│   │   └── __tests__/           # Content script tests
│   ├── popup/                   # Extension popup UI
│   │   ├── Popup.tsx            # Main popup React component
│   │   ├── popup.html           # Popup HTML template
│   │   ├── popup.css            # Popup styles
│   │   └── __tests__/           # Popup component tests
│   ├── components/              # Reusable React components
│   │   ├── RecordingButton.tsx  # Start/stop recording button
│   │   ├── StatusIndicator.tsx  # Recording status display
│   │   ├── AudioVisualizer.tsx  # Audio level visualization
│   │   ├── ErrorBoundary.tsx    # Error handling component
│   │   └── __tests__/           # Component tests
│   ├── services/                # Business logic services
│   │   ├── MediaRecorderService.ts    # Media recording logic
│   │   ├── ChromeAPIService.ts        # Chrome extension APIs
│   │   ├── FileService.ts             # File handling utilities
│   │   ├── ErrorHandlingService.ts    # Error management
│   │   └── __tests__/                 # Service tests
│   ├── offscreen/               # Offscreen document for audio capture
│   │   ├── offscreen.ts         # Audio capture logic
│   │   ├── offscreen.html       # Offscreen document template
│   │   └── __tests__/           # Offscreen tests
│   ├── types/                   # TypeScript type definitions
│   │   ├── chrome.d.ts          # Chrome API type extensions
│   │   ├── components.ts        # Component prop types
│   │   ├── recording.ts         # Recording-related types
│   │   ├── services.ts          # Service interface types
│   │   ├── errors.ts            # Error handling types
│   │   └── media.ts             # Media-related types
│   └── manifest.json            # Chrome extension manifest
├── scripts/
│   └── validate-build.js        # Build validation script
├── dist/                        # Built extension (generated)
├── .env.development             # Development environment variables
├── .env.production              # Production environment variables
├── vite.config.ts               # Vite build configuration
├── tsconfig.json                # TypeScript configuration
├── tsconfig.build.json          # Production TypeScript config
├── package.json                 # Project dependencies and scripts
└── README.md                    # This file
```

## Technology Stack

### Core Technologies

- **TypeScript**: Type-safe JavaScript with modern features
- **React 18**: Component-based UI library with hooks
- **Vite**: Fast build tool with hot module replacement
- **CRXJS**: Vite plugin for Chrome extension development

### Chrome Extension APIs

- **chrome.tabCapture**: Audio capture from browser tabs
- **chrome.scripting**: Content script injection
- **chrome.offscreen**: Offscreen document for media processing
- **chrome.runtime**: Extension messaging and lifecycle

### Media Processing

- **MediaRecorder API**: Video and audio recording
- **Canvas API**: Video stream capture from ShaderToy canvas
- **Web Audio API**: Audio visualization and processing

### Development Tools

- **Vitest**: Fast unit testing framework
- **Testing Library**: React component testing utilities
- **ESLint**: Code linting and style enforcement
- **Terser**: JavaScript minification for production

## Architecture Overview

### Extension Components

1. **Background Service Worker** (`src/background/background.ts`)

   - Manages extension lifecycle
   - Handles cross-tab recording state
   - Coordinates audio capture via offscreen document

2. **Content Script** (`src/content/content.ts`)

   - Injected into ShaderToy pages
   - Detects and captures canvas video streams
   - Communicates with popup and background script

3. **Popup Interface** (`src/popup/Popup.tsx`)

   - Main user interface for the extension
   - Recording controls and status display
   - Built with React components

4. **Offscreen Document** (`src/offscreen/offscreen.ts`)
   - Handles audio capture in Chrome 116+
   - Processes audio streams for recording
   - Required for tab audio capture permissions

### Data Flow

```
ShaderToy Page → Content Script → Background Script → Offscreen Document
                      ↓                    ↓                ↓
                 Canvas Stream      Audio Stream      Combined Stream
                      ↓                    ↓                ↓
                 Popup Interface ← MediaRecorder ← File Download
```

## Build System

### Development Build

- Source maps enabled for debugging
- Hot module replacement for fast development
- Type checking enabled
- Console logs preserved

### Production Build

- Minified and optimized code
- Hidden source maps for security
- Console logs removed
- Terser optimization enabled
- Asset inlining for small files

### Build Validation

The project includes automated build validation:

```bash
npm run validate:build
```

This checks for:

- ✅ Required files and assets
- ✅ Manifest.json validity
- ✅ Extension size limits
- ✅ Source map generation
- ⚠️ Console statement removal

## Testing

### Running Tests

```bash
# Run tests in watch mode
npm run test

# Run tests once
npm run test:run

# Run specific test file
npm run test -- AudioVisualizer.test.tsx

# Run tests with coverage
npm run test -- --coverage
```

### Test Structure

- **Unit Tests**: Individual component and service testing
- **Integration Tests**: Cross-component interaction testing
- **E2E Tests**: Full extension workflow testing

### Test Files Location

- Component tests: `src/components/__tests__/`
- Service tests: `src/services/__tests__/`
- Integration tests: `src/__tests__/`

## Deployment

### Building for Production

1. **Clean previous builds**:

   ```bash
   npm run clean
   ```

2. **Build and validate**:

   ```bash
   npm run validate:build
   ```

3. **Check the output**:
   - Extension files will be in the `dist/` directory
   - Total size should be under 5MB
   - All required files should be present

### Chrome Web Store Deployment

1. **Prepare the package**:

   ```bash
   npm run build:prod
   cd dist
   zip -r ../extension.zip .
   cd ..
   ```

2. **Upload to Chrome Web Store**:
   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
   - Upload the `extension.zip` file
   - Fill in store listing details
   - Submit for review

### Version Management

Update version in these files before deployment:

- `package.json` - npm package version
- `src/manifest.json` - extension version
- `.env.production` - build version variable

## Migration Notes

This extension was migrated from vanilla JavaScript to TypeScript + React. Key changes include:

### Architecture Changes

- ✅ Vanilla JS → TypeScript for type safety
- ✅ Plain HTML/JS → React components
- ✅ Manual bundling → Vite + CRXJS build system
- ✅ Callback-based → Promise-based async handling

### New Features Added

- ✅ Audio capture with graceful degradation
- ✅ Real-time audio visualization
- ✅ Enhanced error handling and user feedback
- ✅ Comprehensive test coverage
- ✅ Production build optimization

### Backward Compatibility

- ✅ Same ShaderToy canvas detection logic
- ✅ Same recording quality and frame rate
- ✅ Same file naming and download behavior
- ✅ Works on all existing ShaderToy pages
