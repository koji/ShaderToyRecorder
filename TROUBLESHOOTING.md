# Troubleshooting Guide

This guide covers common issues and solutions for the ShaderToy Audio-Video Recorder extension.

## Table of Contents

- [Installation Issues](#installation-issues)
- [Audio Capture Problems](#audio-capture-problems)
- [Video Recording Issues](#video-recording-issues)
- [Build and Development Issues](#build-and-development-issues)
- [Chrome Extension Issues](#chrome-extension-issues)
- [Performance Issues](#performance-issues)
- [Error Messages](#error-messages)

## Installation Issues

### Extension Won't Load

**Problem**: Extension fails to load in Chrome

**Solutions**:

1. **Check Chrome Version**:

   - Ensure Chrome 116+ is installed
   - Update Chrome: `chrome://settings/help`

2. **Verify Build**:

   ```bash
   npm run validate:build
   ```

3. **Check Manifest**:

   - Ensure `dist/manifest.json` exists and is valid
   - Verify all required permissions are present

4. **Clear Extension Cache**:
   - Go to `chrome://extensions/`
   - Remove the extension
   - Restart Chrome
   - Reload the extension

### Build Failures

**Problem**: `npm run build` fails

**Common Causes & Solutions**:

1. **Node.js Version**:

   ```bash
   node --version  # Should be 18+
   ```

2. **Dependencies**:

   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

3. **TypeScript Errors**:

   ```bash
   npm run type-check
   # Fix reported errors before building
   ```

4. **Disk Space**:
   - Ensure sufficient disk space (>1GB recommended)

## Audio Capture Problems

### No Audio in Recordings

**Problem**: Video records but no audio is captured

**Diagnosis Steps**:

1. **Check Chrome Version**:

   - Audio capture requires Chrome 116+
   - Earlier versions will fall back to video-only

2. **Verify Permissions**:

   - Go to `chrome://extensions/`
   - Click on extension details
   - Ensure "Allow access to file URLs" is enabled if needed

3. **Check Tab Audio**:

   - Ensure the ShaderToy tab is playing audio
   - Test with a simple audio-enabled ShaderToy shader
   - Check browser volume and tab muting

4. **Test Audio Capture**:
   - Open extension popup
   - Look for audio visualizer activity
   - Check for "Audio capture failed" warnings

**Solutions**:

1. **Enable Tab Audio Capture**:

   ```javascript
   // In browser console on ShaderToy page:
   navigator.mediaDevices
     .getDisplayMedia({
       audio: true,
       video: true,
     })
     .then((stream) => {
       console.log("Audio tracks:", stream.getAudioTracks().length);
     });
   ```

2. **Check System Audio**:

   - Ensure system audio is not muted
   - Check Chrome's site permissions for audio

3. **Restart Chrome**:
   - Sometimes audio permissions need a browser restart

### Audio Quality Issues

**Problem**: Audio is distorted or low quality

**Solutions**:

1. **Check Audio Source**:

   - Ensure ShaderToy audio is high quality
   - Test with different audio sources

2. **Adjust Recording Settings**:

   - The extension uses browser default audio settings
   - Check Chrome's audio settings: `chrome://settings/content/sound`

3. **System Audio Settings**:
   - Check system audio quality settings
   - Ensure no audio enhancements are interfering

### Audio Sync Issues

**Problem**: Audio and video are out of sync

**Solutions**:

1. **Browser Performance**:

   - Close unnecessary tabs
   - Ensure sufficient system resources

2. **Recording Duration**:

   - Shorter recordings tend to have better sync
   - Consider recording in segments for long captures

3. **System Load**:
   - Reduce CPU usage during recording
   - Close resource-intensive applications

## Video Recording Issues

### Canvas Not Detected

**Problem**: Extension can't find ShaderToy canvas

**Solutions**:

1. **Verify ShaderToy Page**:

   - Ensure you're on a valid ShaderToy shader page
   - URL should match: `https://www.shadertoy.com/view/*`

2. **Wait for Page Load**:

   - Allow ShaderToy page to fully load
   - Wait for shader compilation to complete

3. **Check Canvas Element**:

   ```javascript
   // In browser console:
   document.querySelector("#demogl canvas");
   // Should return a canvas element
   ```

4. **Refresh and Retry**:
   - Refresh the ShaderToy page
   - Try a different shader

### Poor Video Quality

**Problem**: Recorded video is blurry or low resolution

**Solutions**:

1. **Canvas Resolution**:

   - ShaderToy canvas resolution affects recording quality
   - Try full-screen mode for higher resolution

2. **Browser Zoom**:

   - Set browser zoom to 100%
   - Avoid zooming in/out during recording

3. **System Performance**:
   - Ensure adequate system resources
   - Close unnecessary applications

### Recording Stops Unexpectedly

**Problem**: Recording stops before user clicks stop

**Possible Causes & Solutions**:

1. **Tab Navigation**:

   - Don't navigate away from ShaderToy page
   - Don't close the tab during recording

2. **System Resources**:

   - Ensure sufficient RAM and CPU
   - Monitor system performance during recording

3. **Chrome Limits**:
   - Chrome may have internal recording limits
   - Try shorter recording sessions

## Build and Development Issues

### TypeScript Errors

**Problem**: Type checking fails

**Solutions**:

1. **Update Dependencies**:

   ```bash
   npm update
   ```

2. **Check TypeScript Version**:

   ```bash
   npx tsc --version
   ```

3. **Clear TypeScript Cache**:
   ```bash
   rm -rf node_modules/.cache
   npm run type-check
   ```

### Vite Build Issues

**Problem**: Vite build fails or is slow

**Solutions**:

1. **Clear Vite Cache**:

   ```bash
   rm -rf node_modules/.vite
   npm run build
   ```

2. **Check Node.js Version**:

   - Ensure Node.js 18+ is installed
   - Consider using Node Version Manager (nvm)

3. **Memory Issues**:
   ```bash
   export NODE_OPTIONS="--max-old-space-size=4096"
   npm run build
   ```

### Test Failures

**Problem**: Tests fail unexpectedly

**Solutions**:

1. **Update Test Dependencies**:

   ```bash
   npm update @testing-library/react @testing-library/jest-dom vitest
   ```

2. **Clear Test Cache**:

   ```bash
   npm run test -- --clearCache
   ```

3. **Check Test Environment**:
   - Ensure jsdom is properly configured
   - Check test setup files

## Chrome Extension Issues

### Permissions Denied

**Problem**: Extension lacks necessary permissions

**Solutions**:

1. **Check Manifest Permissions**:

   ```json
   {
     "permissions": ["scripting", "activeTab", "tabCapture", "offscreen"]
   }
   ```

2. **Reload Extension**:

   - Go to `chrome://extensions/`
   - Click reload button for the extension

3. **Grant Permissions Manually**:
   - Click on extension details
   - Review and enable all permissions

### Content Script Issues

**Problem**: Content script doesn't inject properly

**Solutions**:

1. **Check URL Matching**:

   - Ensure ShaderToy URL matches manifest pattern
   - Pattern: `*://www.shadertoy.com/*`

2. **Manual Injection**:

   ```javascript
   // In background script console:
   chrome.scripting.executeScript({
     target: { tabId: YOUR_TAB_ID },
     files: ["content.js"],
   });
   ```

3. **Check Console Errors**:
   - Open DevTools on ShaderToy page
   - Look for content script errors

### Background Script Issues

**Problem**: Background service worker not responding

**Solutions**:

1. **Check Service Worker**:

   - Go to `chrome://extensions/`
   - Click "Inspect views: service worker"

2. **Restart Service Worker**:

   - Click "Reload" on the extension
   - Or disable/enable the extension

3. **Check Console Logs**:
   - Look for errors in service worker console
   - Check for unhandled promise rejections

## Performance Issues

### High CPU Usage

**Problem**: Extension causes high CPU usage

**Solutions**:

1. **Reduce Recording Quality**:

   - Lower frame rate if possible
   - Reduce canvas resolution

2. **Close Unnecessary Tabs**:

   - Limit browser tab count during recording
   - Close resource-intensive websites

3. **Check for Memory Leaks**:
   - Monitor extension memory usage
   - Restart browser if memory usage is high

### Slow Recording Start

**Problem**: Long delay before recording starts

**Solutions**:

1. **Wait for Initialization**:

   - Allow time for audio/video stream setup
   - Don't click record button repeatedly

2. **Check System Resources**:

   - Ensure adequate RAM and CPU
   - Close unnecessary applications

3. **Browser Performance**:
   - Restart Chrome if it's been running long
   - Clear browser cache and cookies

## Error Messages

### "Audio capture failed"

**Meaning**: Extension couldn't capture tab audio

**Solutions**:

- Check Chrome version (116+ required)
- Verify tab has audio playing
- Check browser audio permissions
- Try refreshing the page

### "Canvas not found"

**Meaning**: Extension can't locate ShaderToy canvas

**Solutions**:

- Ensure you're on a ShaderToy shader page
- Wait for page to fully load
- Try refreshing the page
- Check if shader compiled successfully

### "Recording failed to start"

**Meaning**: MediaRecorder couldn't initialize

**Solutions**:

- Check browser compatibility
- Ensure sufficient system resources
- Try a different shader/page
- Restart the browser

### "Permission denied"

**Meaning**: Extension lacks required permissions

**Solutions**:

- Check extension permissions in Chrome
- Reload the extension
- Ensure manifest.json has correct permissions
- Try reinstalling the extension

### "Build validation failed"

**Meaning**: Production build has issues

**Solutions**:

- Run `npm run validate:build` for details
- Check for missing files in dist/
- Verify manifest.json is valid
- Ensure all assets are properly built

## Getting Help

If you're still experiencing issues:

1. **Check Browser Console**:

   - Look for error messages in DevTools
   - Check both page console and extension console

2. **Enable Debug Mode**:

   - Use development build for more detailed logs
   - Check extension service worker console

3. **Gather Information**:

   - Chrome version
   - Operating system
   - Extension version
   - Specific error messages
   - Steps to reproduce

4. **Test with Minimal Setup**:

   - Try with a fresh Chrome profile
   - Test with a simple ShaderToy shader
   - Disable other extensions temporarily

5. **Report Issues**:
   - Include all gathered information
   - Provide steps to reproduce
   - Include console logs and error messages

## Prevention Tips

- Keep Chrome updated to the latest version
- Regularly update the extension
- Monitor system resources during recording
- Test with simple shaders before complex ones
- Keep browser tabs to a minimum during recording
- Restart Chrome periodically for optimal performance
