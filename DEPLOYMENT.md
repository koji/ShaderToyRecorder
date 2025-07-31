# Deployment Guide

This guide covers how to deploy the ShaderToy Audio-Video Recorder extension to the Chrome Web Store and manage releases.

## Table of Contents

- [Pre-deployment Checklist](#pre-deployment-checklist)
- [Building for Production](#building-for-production)
- [Chrome Web Store Deployment](#chrome-web-store-deployment)
- [Version Management](#version-management)
- [Release Process](#release-process)
- [Post-deployment](#post-deployment)
- [Rollback Procedures](#rollback-procedures)

## Pre-deployment Checklist

Before deploying, ensure all the following items are completed:

### Code Quality

- [ ] All tests pass: `npm run test:run`
- [ ] Type checking passes: `npm run type-check`
- [ ] Build validation passes: `npm run validate:build`
- [ ] No console errors in production build
- [ ] Code review completed (if applicable)

### Functionality Testing

- [ ] Extension loads correctly in Chrome
- [ ] Canvas detection works on various ShaderToy pages
- [ ] Audio capture works (Chrome 116+)
- [ ] Video recording works
- [ ] File download works
- [ ] Error handling works (test with audio disabled)
- [ ] UI components render correctly
- [ ] Extension popup functions properly

### Documentation

- [ ] README.md is up to date
- [ ] TROUBLESHOOTING.md covers known issues
- [ ] Version numbers are updated
- [ ] Changelog is updated (if applicable)

### Legal and Compliance

- [ ] Privacy policy is current (if required)
- [ ] Terms of service are current (if required)
- [ ] All dependencies have compatible licenses
- [ ] No sensitive data in build output

## Building for Production

### 1. Clean Previous Builds

```bash
npm run clean
```

### 2. Update Version Numbers

Update version in these files:

**package.json**:

```json
{
  "version": "2.0.0"
}
```

**src/manifest.json**:

```json
{
  "version": "2.0.0"
}
```

**.env.production**:

```env
VITE_VERSION=2.0.0
```

### 3. Build and Validate

```bash
# Build optimized production version
npm run build:prod

# Validate the build
npm run validate:build
```

### 4. Test the Production Build

1. **Load in Chrome**:

   ```bash
   # The dist/ folder contains the built extension
   # Load this in Chrome via chrome://extensions/
   ```

2. **Test Core Functionality**:

   - Visit a ShaderToy page
   - Test recording with and without audio
   - Verify file downloads work
   - Check error handling

3. **Performance Testing**:
   - Monitor CPU usage during recording
   - Test with complex shaders
   - Verify memory usage is reasonable

### 5. Create Distribution Package

```bash
# Navigate to build output
cd dist

# Create zip file for Chrome Web Store
zip -r ../shadertoy-recorder-v2.0.0.zip .

# Return to project root
cd ..
```

## Chrome Web Store Deployment

### 1. Developer Account Setup

1. **Create Developer Account**:

   - Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
   - Pay the one-time $5 registration fee
   - Verify your identity

2. **Set Up Publisher Account**:
   - Complete publisher verification if required
   - Set up payment methods (if paid extension)

### 2. Create Store Listing

#### Required Information

**Basic Information**:

- **Name**: ShaderToy Audio-Video Recorder
- **Summary**: Record ShaderToy canvas with audio capture
- **Description**:

  ```
  Enhanced Chrome extension for recording ShaderToy canvas animations with synchronized audio capture.

  Features:
  • Record high-quality video from ShaderToy canvas
  • Capture browser audio (music that influences shaders)
  • Combine audio and video into single MP4 file
  • Graceful degradation when audio unavailable
  • Real-time recording status and audio visualization
  • Built with modern TypeScript + React architecture

  Requirements:
  • Chrome 116+ for audio capture
  • Works on all ShaderToy shader pages

  Perfect for:
  • Creating shader demos and tutorials
  • Capturing music-reactive visualizations
  • Sharing interactive art creations
  • Educational content creation
  ```

**Category**: Developer Tools

**Language**: English

#### Visual Assets

**Icons** (create these in various sizes):

- 16x16 px (toolbar icon)
- 48x48 px (extension management page)
- 128x128 px (Chrome Web Store)

**Screenshots** (1280x800 or 640x400):

1. Extension popup interface
2. Recording in progress on ShaderToy
3. Audio visualization active
4. Successful recording completion

**Promotional Images** (optional but recommended):

- Small promotional tile: 440x280 px
- Large promotional tile: 920x680 px
- Marquee promotional tile: 1400x560 px

#### Privacy and Permissions

**Privacy Policy** (if collecting data):

```
This extension does not collect, store, or transmit any personal data.

Data Processing:
• Audio and video are processed locally in your browser
• No data is sent to external servers
• Recordings are saved directly to your device
• No analytics or tracking are implemented

Permissions Used:
• "scripting" - To inject content scripts into ShaderToy pages
• "activeTab" - To access the current tab for canvas capture
• "tabCapture" - To capture audio from browser tabs
• "offscreen" - To process audio in background (Chrome 116+)

All processing occurs locally on your device.
```

**Permissions Justification**:

- scripting: Required to detect and capture ShaderToy canvas elements
- activeTab: Needed to access canvas content for video recording
- tabCapture: Essential for capturing browser audio to sync with video
- offscreen: Required for audio processing in Chrome 116+

### 3. Upload and Submit

1. **Upload Package**:

   - Click "Add new item"
   - Upload the zip file created earlier
   - Wait for automatic analysis

2. **Complete Store Listing**:

   - Fill in all required fields
   - Upload all visual assets
   - Set pricing (free recommended)
   - Select distribution regions

3. **Submit for Review**:
   - Review all information
   - Submit for Chrome Web Store review
   - Review typically takes 1-3 business days

### 4. Review Process

**What Chrome Reviews**:

- Manifest permissions usage
- Code quality and security
- User experience
- Compliance with policies

**Common Rejection Reasons**:

- Excessive permissions
- Poor user experience
- Security vulnerabilities
- Policy violations
- Misleading descriptions

**If Rejected**:

- Address all feedback points
- Update code/listing as needed
- Resubmit for review

## Version Management

### Semantic Versioning

Use semantic versioning (MAJOR.MINOR.PATCH):

- **MAJOR**: Breaking changes or major feature additions
- **MINOR**: New features, backward compatible
- **PATCH**: Bug fixes, backward compatible

Examples:

- `2.0.0` - Major rewrite (JS to TypeScript migration)
- `2.1.0` - New audio visualization feature
- `2.1.1` - Bug fix for audio sync issue

### Version Update Process

1. **Update Version Numbers**:

   ```bash
   # Update package.json
   npm version patch  # or minor/major

   # Manually update src/manifest.json
   # Manually update .env.production
   ```

2. **Create Git Tag**:

   ```bash
   git add .
   git commit -m "Release v2.1.0"
   git tag v2.1.0
   git push origin main --tags
   ```

3. **Update Changelog**:

   ```markdown
   ## [2.1.0] - 2024-01-15

   ### Added

   - Real-time audio visualization
   - Enhanced error messages

   ### Fixed

   - Audio sync issues on slower systems
   - Memory leak in long recordings
   ```

## Release Process

### 1. Pre-release Testing

```bash
# Run full test suite
npm run test:run

# Build and validate
npm run validate:build

# Manual testing checklist
# - Load extension in fresh Chrome profile
# - Test on multiple ShaderToy pages
# - Test with/without audio
# - Verify error handling
# - Check performance
```

### 2. Create Release Build

```bash
# Clean and build
npm run clean
npm run build:prod

# Create distribution package
cd dist
zip -r ../release-v2.1.0.zip .
cd ..
```

### 3. Deploy to Chrome Web Store

1. **Upload New Version**:

   - Go to Developer Dashboard
   - Select your extension
   - Click "Package" tab
   - Upload new zip file

2. **Update Store Listing** (if needed):

   - Update description for new features
   - Add new screenshots if UI changed
   - Update version notes

3. **Submit for Review**:
   - Review changes
   - Submit for publication

### 4. Monitor Deployment

1. **Check Review Status**:

   - Monitor Developer Dashboard
   - Respond to any review feedback

2. **Post-publication Monitoring**:
   - Check user reviews and ratings
   - Monitor for crash reports
   - Watch for support requests

## Post-deployment

### 1. Verify Live Extension

1. **Install from Store**:

   - Install extension from Chrome Web Store
   - Test core functionality
   - Verify version number is correct

2. **Monitor Metrics**:
   - User installations
   - User reviews and ratings
   - Crash reports (if any)

### 2. User Communication

1. **Release Announcement**:

   - Update project README
   - Post on relevant forums/communities
   - Social media announcement (if applicable)

2. **Documentation Updates**:
   - Ensure all docs reflect new version
   - Update troubleshooting guide if needed
   - Update installation instructions

### 3. Support Preparation

1. **Monitor Feedback**:

   - Chrome Web Store reviews
   - GitHub issues (if open source)
   - User support channels

2. **Prepare Responses**:
   - Common issue solutions
   - Feature request acknowledgments
   - Bug report templates

## Rollback Procedures

### If Critical Issues Are Found

1. **Immediate Actions**:

   - Document the issue thoroughly
   - Determine impact and severity
   - Decide if rollback is necessary

2. **Chrome Web Store Rollback**:

   - Chrome Web Store doesn't support instant rollback
   - Must upload previous working version as new update
   - Submit for expedited review (mention critical fix)

3. **Emergency Rollback Process**:

   ```bash
   # Checkout previous working version
   git checkout v2.0.0

   # Update version to be higher than current
   # e.g., if current is 2.1.0, use 2.1.1

   # Build and deploy
   npm run build:prod
   # Create zip and upload to Chrome Web Store
   ```

4. **Communication**:
   - Update store listing with fix information
   - Communicate with affected users
   - Post updates on support channels

### Prevention Strategies

1. **Staged Rollout**:

   - Consider gradual rollout for major versions
   - Monitor early adopters before full release

2. **Automated Testing**:

   - Comprehensive test coverage
   - Automated build validation
   - Performance regression testing

3. **Beta Testing**:
   - Internal testing team
   - Beta user group
   - Extended testing period for major releases

## Best Practices

### Development

- Always test in production-like environment
- Use feature flags for major changes
- Maintain backward compatibility when possible
- Keep dependencies up to date

### Deployment

- Deploy during low-usage hours
- Have rollback plan ready
- Monitor closely after deployment
- Communicate changes clearly to users

### Maintenance

- Regular security updates
- Performance monitoring
- User feedback incorporation
- Documentation maintenance

## Troubleshooting Deployment Issues

### Common Problems

1. **Upload Rejected**:

   - Check manifest.json validity
   - Verify all required files are included
   - Ensure no development files in package

2. **Review Rejection**:

   - Address all feedback points
   - Update permissions justification
   - Improve user experience based on feedback

3. **Slow Review Process**:

   - Ensure complete and accurate listing
   - Avoid policy violations
   - Be patient - complex extensions take longer

4. **Post-deployment Issues**:
   - Monitor user feedback closely
   - Prepare hotfix releases for critical issues
   - Maintain good communication with users

For additional help, consult the [Chrome Web Store Developer Documentation](https://developer.chrome.com/docs/webstore/).
